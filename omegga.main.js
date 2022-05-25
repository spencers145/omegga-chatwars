class war {
    constructor(omegga, config, store, challenger, combatants, rounds, phrasePool) {
        this.omegga = omegga;
        this.config = config;
        this.store = store;
        this.needsCleanup = false;
        
        this.challenger = challenger;
        this.combatants = combatants;
        this.rounds = rounds;
        this.scores = {}
        combatants.forEach(combatant => {
            this.scores[combatant] = 0;
        });
        this.roundStartTime = Date.now();

        this.phrasePool = phrasePool;
        this.phrase = ``;
        this.timers = [];
        this.confirmations = {};
        this.readys = {};

        this.getConfirmation();
    }

    getConfirmation() {
        this.combatants.forEach(combatant => {
            if (combatant !== this.challenger) {
                this.omegga.broadcast(`<b>${this.challenger} has declared a chat war on ${combatant}!</>`);
                this.omegga.whisper(combatant, `<i>${this.challenger} has declared chat war on you! Type /cw accept or /cw decline!</>`);
                this.omegga.whisper(combatant, `<i>You can view the rules of the game with /cw rules.</>`);
                this.confirmations[combatant] = setTimeout(() => {
                    this.omegga.broadcast(`War request timed out.`);
                    this.removeWar(`<i>War cancelled. Someone failed to respond to the confirmation prompt.</>`);
                }, 20000);
            }
        });
    }

    setConfirmation(player, status) {
        if (this.confirmations[player] !== true && status) {
            clearTimeout(this.confirmations[player]);
            this.confirmations[player] = true;
            this.omegga.broadcast(`<b>${player} has accepted a declaration of chat war from ${this.challenger}.</>`);
            if (this.isConfirmationProcessCompleted()) this.startWar();
        } else if (!status) {
            this.omegga.broadcast(`<b>${player} has refused!</>`);
            this.removeWar(`<i>War cancelled. Offer declined.</>`);
        }
    }

    isConfirmationProcessCompleted() {
        let allConfirmed = true;
        Object.keys(this.confirmations).forEach(key => {
            if (this.confirmations[key] !== true) {
                allConfirmed = false;
            }
        });

        return allConfirmed;
    }

    startWar() {
        this.startTime = 0; //now somehow
        this.whisperCombatants(`<i>War starting in 5 seconds.</>`);
        this.timers.push(setTimeout(() => {
            this.timers.splice(0, 1);
            this.countdown();
        }, 5000));
    }

    countdown() {
        //countdown then startround
        this.whisperCombatants(`<i>3...</>`);

        this.timers.push(setTimeout(() => {
            this.timers.splice(0, 1);
            this.whisperCombatants(`<i>2...</>`);
        }, 1000));

        this.timers.push(setTimeout(() => {
            this.timers.splice(0, 1);
            this.whisperCombatants(`<i>1...</>`);
        }, 2000));

        this.timers.push(setTimeout(() => {
            this.timers.splice(0, 1);
            this.startRound();
        }, 3000 + Math.floor(Math.random() * 2000)));
    }

    startRound() {
        this.roundStartTime = Date.now();
        const RANDOM_INDEX = Math.floor(this.phrasePool.length * Math.random());
        this.phrase = this.phrasePool[RANDOM_INDEX];
        // tell players the phrase
        this.whisperCombatants(`<i>PHRASE: </>"${this.phrase}"`);
        this.timers.push(setTimeout(() => {
            this.timers.splice(0, 1);
            this.endRound();
        }, 15000));
        // also record round start time
    }

    async endRound(winner) {
        if (winner) {
            //update average WPM
            let currentStore = await this.store.get(winner);
            if (!currentStore) {
                currentStore = { wins: 0, losses: 0, averageWPM: 0, sampleSize: 0 };
            }
            const NUM_WORDS_IN_PHRASE = this.phrase.split(` `).length;
            const TIME_TAKEN = (Date.now() - this.roundStartTime) / 1000;
            const WPS = NUM_WORDS_IN_PHRASE * (1 / TIME_TAKEN);
            const WPM = WPS * 60;
            const RAW_WPM_TOTAL = currentStore.averageWPM * currentStore.sampleSize;
            currentStore.averageWPM = (RAW_WPM_TOTAL + WPM) / (currentStore.sampleSize + 1)
            currentStore.sampleSize += 1;
            await this.store.set(winner, currentStore);

            //now tell players and set scores
            this.omegga.broadcast(`<b>${winner} gets a point for typing</> ${this.phrase} <b>first!</>`);
            this.scores[winner] += 1;
            //clear leftover timeouts
            clearTimeout(this.timers[0]);
            this.timers.splice(0, 1);
        } else {
            this.whisperCombatants(`<i>Nobody typed the phrase in time.</>`);
        }
        this.phrase = ``;

        const PLAYERS = await this.omegga.getPlayers();
        const PLAYER_NAMES = [];
        PLAYERS.forEach(player => {
            PLAYER_NAMES.push(player.name);
        })
        this.combatants.forEach((combatant, index) => {
            if (!PLAYER_NAMES.includes(combatant)) this.combatants.splice(index, 1);
        });

        if (this.isWarWinnerDeclarable()) {
            this.end();
        } else {
            this.showScores();
            this.timers.push(setTimeout(() => {
                this.timers.splice(0, 1);
                this.countdown();
            }, 2000))
        }
    }

    async end() {
        //find and declare the winner
        if (this.combatants.length === 1) {
            this.omegga.broadcast(`<b>${this.combatants[0]} won a chat war by default!</>`);
            let currentStore = await this.store.get(this.combatants[0]);
            if (!currentStore) {
                currentStore = { wins: 0, losses: 0, averageWPM: 0, sampleSize: 0 };
            }
            currentStore.wins += 1;
            await this.store.set(this.combatants[0], currentStore);
        } else if (this.combatants.length > 1) {
            //do actual algorithm
            let winner = this.combatants[0];
            this.combatants.forEach(combatant => {
                if (this.scores[combatant] > this.scores[winner]) winner = combatant;
            });
            this.omegga.broadcast(`<b>${winner} has won a chat war!</>`);
            this.combatants.forEach(async (combatant) => {
                let currentStore = await this.store.get(combatant);
                if (!currentStore) {
                    currentStore = { wins: 0, losses: 0, averageWPM: 0, sampleSize: 0 };
                }
                if (winner === combatant) {
                    currentStore.wins += 1;
                } else {
                    currentStore.losses += 1;
                }
                await this.store.set(combatant, currentStore);
            });
        }

        this.removeWar();
    }

    isPlayerCombatant(player) {
        return this.combatants.includes(player);
    }

    whisperCombatants(msg) {
        this.combatants.forEach(combatant => {
            this.omegga.whisper(combatant, msg);
        });
    }

    checkMessage(msg, player) {
        if (msg === this.phrase) this.endRound(player);
    }

    showScores() {
        let scoreMessage = `<i>SCORES: `;
        this.combatants.forEach((combatant, index) => {
            if (index === 0) {
                scoreMessage += `${combatant} - ${this.scores[combatant]}`;
            } else {
                scoreMessage += `, ${combatant} - ${this.scores[combatant]}`;
            }
        });
        this.whisperCombatants(`${scoreMessage}</>`);
    }

    isWarWinnerDeclarable() {
        if (this.combatants.length <= 1) {
            return true;
        } else {
            //do actual algorithm
            let anyWinners = false;
            this.combatants.forEach(combatant => {
                if (this.scores[combatant] > this.rounds/2) anyWinners = true;
            });
            if (anyWinners) return true;
        }
    }

    removeWar(reason) {
        if (reason) {
            this.whisperCombatants(reason);
        }
        //cancel all timers
        Object.keys(this.confirmations).forEach(key => {
            if (typeof key === `number`) clearTimeout(this.confirmations[key]);
        });

        this.timers.forEach(timer => {
            clearTimeout(timer);
        });

        //mark this war for cleanup
        this.needsCleanup = true;
    }

    isCleanupNeeded() {
        return this.needsCleanup;
    }
}

module.exports = class Plugin {
    constructor(omegga, config, store) {
      this.omegga = omegga;
      this.config = config;
      this.store = store;
    }

    async arePlayersOnline(players) {
        let allOnline = true;
        const PLAYERS = await this.omegga.getPlayers();
        const PLAYER_NAMES = [];
        PLAYERS.forEach(player => {
            PLAYER_NAMES.push(player.name);
        })
        players.forEach(player => {
            if (!PLAYER_NAMES.includes(player)) allOnline = false;
        });
        return allOnline;
    }

    arePlayersInWar(players) {
        let allWarless = true;
        players.forEach(player => {
            if (this.isPlayerInWar(player)) allWarless = false;
        });
        return allWarless;
    }

    isPlayerInWar(player) {
        let playerWarless = true;
        this.wars.forEach(chatWar => {
            if (chatWar.isPlayerCombatant(player)) playerWarless = false;
        });
        return playerWarless;
    }

    argsToMessage(args) {
        let outstring = ``;
        args.forEach((arg, index) => {
            if (index === 0) {
                outstring += arg;
            } else {
                outstring += ` ${arg}`;
            }
        });
        return outstring;
    }

    getWarFromPlayer(player) {
        let whichWar = false;
        this.wars.forEach(chatWar => {
            if (chatWar.isPlayerCombatant(player)) whichWar = chatWar;
        });
        return whichWar;
    }
  
    async init() {
        this.wars = [];
        this.phrases = [
            `Mr. LoL is gay`,
            `egg, honestly`,
            `These phrases suck.`,
            `I'm typing in public!`,
            `I hereby agree to the terms and conditions.`,
            `I will not grief or spam!`,
            `I will not engage in a little trolling!`,
            `I will not AFK in minigames!`,
            `I will not copy-paste phrases!`,
            `I will not get banned! Probably.`,
            `This chat ain't big enough for the two of us!`,
            `1, 2, 3, 4, I declare a chat war!`,
            `it's 10:40 pm`,
            `plugins are cool!`,
            `I will now AFK to go touch grass.`,
            `This is a message for chat wars.`,
            `base is running out of ideas for phrases!!!`,
            `Words & Numbers, Sound & Silence`,
            `Stop the peace & keep the violence!`,
            `4^2 = 16, I think?`,
            `Lorem ipsum dolor sit amet`,
            `i can type faster than you`,
            `lucky`,
            `You are hereby sentenced to 7 words.`,
            `google.com how to install brickadia hack 2022`,
            `guys i have 20k ping what do i do?`,
            `110 WPM`,
            `63.255.190.101 84 Woodland Drive ZIP 40645`,
            `skibidibop mmdadap`,
            `I'm the scatman!`,
            `Haha, you lose!`,
            `My opponents are slower typers than I am.`,
            `My lawyer has advised me not to continue this phrase.`,
            `What's the admin password?`,
            `We do a little typing...`,
            `(this chat message was sponsored by Hello Fresh)`,
            `brickadia is a voxel-based sandbox game`,
            `hot take: microbricks`,
            `The things we do, the things we say, all the things we wish we could wash away`,
            `WPM stands for "Words per minute." In case you didn't know.`,
            `Friendly reminder that the Page Up key keeps chat onscreen.`,
            `Friendly reminder that F3 hides the hud.`,
            `Friendly reminder that N detaches the cursor.`,
            `Friendly reminder to use the Up Arrow in chat sometimes.`,
            `To be fair, you have to have a fairly high WPM to understand Chat Wars.`,
            `hey guys`,
            `Why yes, I have sunk 2000 hours into this game.`,
            `A6 tomorrow, A7 next week`,
            `Have you guys tried oreos with sweet hot sauce?`,
            `Have y'all ever heard of vertical mice?`,
            `Anybody played Bejeweled 3?`,
            `Have you all heard of Nuclear Throne?`,
            `Who here is from Blockland?`,
            `Who here plays Roblox?`,
            `Have you heard of today's sponsor?`,
            `What's your favorite fruit?`,
            `What's everyone's favorite Brickadia weapon?`,
            `Thanks to UnstoppableGiant and FlavouredGames for helping test this plugin.`
        ];

        this.omegga.on("cmd:cw", async (player, subcommand, ...args) => {
            const CHAT_WAR = this.getWarFromPlayer(player);
            switch (subcommand) {
                case `declare`:
                    //run challenge routine
                    if (args.includes(player)) {
                        this.omegga.whisper(player, `<i>You can't declare a chat war on yourself.</>`);
                    } else if (!args) {
                        this.omegga.whisper(player, `<i>You must specify who to declare war on.</>`)
                    } else if (await this.arePlayersOnline(args)) {
                        if (!this.arePlayersInWar(args) && !CHAT_WAR) {
                            args.push(player);
                            this.wars.push(new war(this.omegga, this.config, this.store, player, args, 5, this.phrases));
                        } else {
                            this.omegga.whisper(player, `<i>At least one of those players is already embroiled in a chat war, or is waiting to start one.</>`);
                        }
                    } else {
                        this.omegga.whisper(player, `<i>Can't find at least one of those players. Remember to use quotes (e.g. "playername") if the name has spaces.</>`);
                    }
                    //make and store a war object
                    break;
                case `stats`:
                    //show player stats
                    //either own or other person's
                    if (args.length < 2) {
                        let target;
                        if (args.length === 1) {
                            target = args[0];
                        } else {
                            target = player;
                        }

                        const CURRENT_STORE = await this.store.get(target);
                        if (!CURRENT_STORE) {
                            this.omegga.whisper(player, `<i>No statistics available for ${target}.</>`);
                        } else {
                            this.omegga.whisper(player, `<b>STATISTICS FOR ${target}</>`);
                            this.omegga.whisper(player, `WINS: ${CURRENT_STORE.wins}`);
                            this.omegga.whisper(player, `LOSSES: ${CURRENT_STORE.losses}`);
                            this.omegga.whisper(player, `PHRASES TYPED: ${CURRENT_STORE.sampleSize}`);
                            this.omegga.whisper(player, `AVERAGE WPM: ${Math.round(CURRENT_STORE.averageWPM)}`);
                        }
                    } else {
                        this.omegga.whisper(player, `<i>You can't get stats from more than one player at a time.</>`);
                    }
                    break;
                case `rules`:
                    //show rules for gamemode and example
                    this.omegga.whisper(player, `<b>EXAMPLE OF PLAYING:</>`);
                    this.omegga.whisper(player, `the chat says 'PHRASE: "I will do a thing, probably."'`);
                    this.omegga.whisper(player, `You would type: I will do a thing, probably.`);
                    this.omegga.whisper(player, `/cw declare "playername" to declare a chat war!`);
                    this.omegga.whisper(player, `/cw accept or /cw decline to respond to a declaration aimed at you!`);
                    break;
                case `accept`:
                    if (CHAT_WAR && !CHAT_WAR.isConfirmationProcessCompleted()) {
                        CHAT_WAR.setConfirmation(player, true);
                    } else {
                        this.omegga.whisper(player, `<i>You have no pending war requests.</>`);
                    }
                    break;
                case `decline`:
                    if (CHAT_WAR && !CHAT_WAR.isConfirmationProcessCompleted()) {
                        CHAT_WAR.setConfirmation(player, false);
                    } else {
                        this.omegga.whisper(player, `<i>You have no pending war requests.</>`);
                    }
                    break;
                case `a`:
                    //we are trying to participate in war currently
                    this.wars.forEach(chatWar => {
                        if (chatWar.isPlayerCombatant(player)) {
                            chatWar.checkMessage(this.argsToMessage(args), player);
                        }
                    });
                    break;
                default:
                    //bad syntax, show valid subcommands
                    this.omegga.whisper(player, `/cw declare "playername" to declare a chat war!`);
                    this.omegga.whisper(player, `/cw stats to view your statistics, like win/loss and WPM!`);
                    this.omegga.whisper(player, `/cw stats "playername" to view someone else's statistics!`);
                    this.omegga.whisper(player, `/cw rules to view the rules of the game!`);
                    this.omegga.whisper(player, `/cw accept or /cw decline to respond to a declaration aimed at you!`);
                    this.omegga.whisper(player, `Remember that you can use the Page Up key to keep chat onscreen.`)
            }
        });

        this.omegga.on("chat", (player, msg) => {
            const CHAT_WAR = this.getWarFromPlayer(player);
            //we are trying to participate in war currently
            if (CHAT_WAR) {
                CHAT_WAR.checkMessage(msg, player);
            }
        });

        this.cleanupTimer = setInterval(() => {
            this.wars.forEach((chatWar, index) => {
                if (chatWar.isCleanupNeeded()) {
                    this.wars.splice(index, 1);
                }
            })
        }, 100);
        return {"registeredCommands": ["cw"]};
    }
  
    async stop() {
        clearInterval(this.cleanupTimer);
        this.wars.forEach(chatWar => {
            chatWar.removeWar();
        });
    }
}
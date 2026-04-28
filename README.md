# Chess Coach — Reiatsu Edition

> “Chess apps train moves.  
> Chess Coach trains decision-making.”

Chess Coach is an interactive chess training web app inspired by the idea of **Reiatsu (霊圧)** from the anime *Bleach* — the concept of spiritual pressure that reflects a warrior’s presence, control, and growth.

Instead of treating improvement as just a number, this project turns chess progression into something that feels alive, visible, and personal.

## What is Reiatsu?

In *Bleach*, Reiatsu represents the pressure created when spiritual power is released. Stronger warriors naturally emit stronger Reiatsu, and skilled fighters learn to control it with precision.
Chess Coach adapts this idea into a chess improvement system.

Here, Reiatsu is not meant to replace ELO or objectively measure chess strength. Instead, it acts as a motivational progression system that reflects:

- decision quality
- consistency
- tactical awareness
- discipline under pressure
- reduction of impulsive mistakes

The goal is not just to win games, but to become a more controlled and thoughtful player.

## Product Philosophy

Most chess platforms focus mainly on results.

Chess Coach focuses on the thinking process behind those results.

The app is designed around the idea that improvement should feel rewarding even before a player becomes objectively strong. Instead of only punishing mistakes after the game ends, Chess Coach tries to guide the player during the decision-making process itself.

## What I Built

I built a chess training web application with:

- playable 8x8 chess board
- AI opponent mode
- local play mode
- player color selection
- move evaluation system
- Anti-Blunder System (ABS)
- AI Coach feedback
- Reiatsu progression system
- match history with Supabase
- gamified improvement loop

## Main Features

### Reiatsu System

Players gain or lose Reiatsu depending on the quality of their decisions.

Reiatsu changes based on:
- victories and defeats
- good moves
- inaccuracies
- mistakes
- blunders
- overall consistency

The long-term goal is to reach **10,000 Reiatsu**, representing the completion of the training journey.

### Anti-Blunder System (ABS)

Before committing a dangerous move, the system can warn the player and encourage reconsideration.

The idea is to simulate the feeling of “losing control under pressure” and train players to slow down before making impulsive decisions.

### AI Coach

The AI Coach provides feedback about important moments during the game and encourages stronger decision-making habits.

### Match History

Games and progression data can be stored using Supabase, allowing players to track long-term growth.

## Vision

I wanted to build something closer to a:

> “Duolingo for chess thinking”

than a traditional chess engine.

The project combines:
- chess
- gamification
- coaching
- progression systems
- anime-inspired motivation mechanics

into a single learning experience.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- chess.js

## Future Directions

Potential future features include:

- adaptive AI coaching
- player mentality analysis
- behavioral playstyle tracking
- premium board and piece themes
- advanced post-game reports
- personalized training systems
- social progression systems

## Links

Live project: https://reiatsu-ai-chess.vercel.app

GitHub repository: https://github.com/DeSH031/reiatsu-ai-chess

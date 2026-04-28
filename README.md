# Chess Coach

Chess Coach is an interactive chess training web app that helps players not only play chess, but also understand their decisions during the game.

## What I built

I built a chess web application with:

- playable 8x8 chess board
- game mode against AI
- local play mode
- player color selection
- reset functionality
- move evaluation system
- Reiatsu progression system
- anti-blunder support
- AI Coach feedback
- match history / progress tracking with Supabase

## Who it is for

This product is for beginner and intermediate chess players who want to improve their thinking process instead of only playing random games.

Many chess platforms show whether a move is good or bad after the game. My idea is different: the app tries to help the player during the decision-making process by warning about dangerous moves, encouraging better thinking, and turning progress into a motivational system.

## Why it is valuable

The value of the product is that it combines chess training with gamification.

The Reiatsu system gives players a sense of progress. Good decisions increase Reiatsu, while mistakes reduce it. This makes improvement feel more visible and motivates users to play more carefully.

The AI Coach and anti-blunder features help players understand not just what move they played, but why it matters.

## Main features

### AI Coach

The AI Coach gives feedback about the game and helps the player understand important moments.

### Anti-Blunder System

The anti-blunder system warns the player before making a potentially bad move. This helps users slow down and think before committing a mistake.

### Reiatsu System

Reiatsu is a gamified progress score. It is not meant to be a perfect chess rating. Instead, it is a motivational system based on:

- game result
- good moves
- mistakes
- blunders
- overall decision quality

The goal is to reach 10,000 Reiatsu, which represents completing the training journey.

### Match History

The app can save match data and progress using Supabase.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- chess.js

## Future improvements

- stronger AI difficulty levels
- better post-game analysis
- user authentication
- detailed player statistics
- leaderboard
- improved mobile design
- more advanced coach explanations

## Links

Live project: [add your deployed project link here]

GitHub repository: [add your GitHub repository link here]

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

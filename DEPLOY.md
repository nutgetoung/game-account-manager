# Free deployment

This project is prepared for a free split deployment:

- Netlify serves the frontend.
- Render runs the Express API.
- Neon PostgreSQL stores users, accounts, and sessions persistently.
- Gmail sends verification and reset emails.

## Deploy the API to Render

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Set `APP_URL` to the final Netlify URL, for example `https://your-site.netlify.app`.
4. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in the Render environment settings.
5. Deploy and test `https://your-api.onrender.com/health`.

## Connect Netlify

1. Replace `REPLACE_WITH_YOUR_RENDER_SERVICE` in [netlify.toml](netlify.toml) with the Render service hostname.
2. In Netlify, choose **Add new site > Import an existing project**.
3. Select the repository. Use the default publish directory `.` and no build command.
4. Deploy, then open the Netlify URL.

The Netlify redirects proxy `/api/*` to Render, so the browser can keep using relative API URLs and sessions remain same-site.

## Neon database

Set `DATABASE_URL` in Render to the Neon connection string. The application creates the `users`, `accounts`, and session tables automatically on startup. Neon keeps the data independently of Render redeploys.

The Neon free plan can scale to zero when inactive, so the first request after inactivity may be slower.

Never commit `.env`, `.vault-key`, database files, or Gmail credentials.
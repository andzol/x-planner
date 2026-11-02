# X Planner

A static page for planning X posts: 6 slots a day, drag and drop, text / image / video drafts.

It holds no data. It reads and writes `planner/posts.json` in a private scheduler repo through the
GitHub API, using a fine-grained token that you paste into Settings and that stays in your browser's
localStorage. A GitHub Actions workflow in that repo posts each slot via the X API.

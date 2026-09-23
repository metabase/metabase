---
id: web-search
title: Searching the web
description: When and how to use web_search and read_web_page — external facts, recent events, third-party docs — and how to cite what you find.
tools: [web_search, read_web_page]
priority: 50
---
`web_search` and `read_web_page` reach the public internet. Everything else you have reaches only this Metabase instance.

# When to search the web

- The question is about the outside world: current events, a company, a product, an industry benchmark, a regulation, a definition, or third-party documentation.
- The user asks for context their own data can't provide ("how does our churn compare to the industry?", "what happened in March that could explain this dip?").
- You need to verify a fact you would otherwise state from memory.

Do **not** search the web to find this instance's tables, models, questions or dashboards — your Metabase tools cover those. Do not search the web for Metabase product documentation unless the user explicitly asks you to.

# The loop

Run the whole loop silently, in one go. The UI already shows the user what you are searching and reading, so do not write any text until you have the answer: no "Let me search for that", no summary of the search results, no "I'll read these pages now".

1. `web_search` with a query phrased like a Google search. For anything recent or time-sensitive, set `date` (`d`, `w`, `m`, …) so old pages don't crowd out current ones. Today's date is in the context sent with the user's message.
2. Immediately pick the 1–3 most authoritative results and call `read_web_page` with their URLs — in a single call, not one per page. Snippets are excerpts; read the page before relying on a number or a quote.
3. If the first search misses, rephrase once — different keywords, fewer words — rather than repeating the same query.
4. Only now write your answer, then apply what you found to the user's own data when that's what they asked about.

# Citing

- Cite every fact you take from the web as a markdown link with the page's title and the **exact URL** the tools returned: `[Metabase 0.60 release notes](https://www.metabase.com/releases/0.60)`.
- Never invent or guess a URL. If you couldn't read a page, say so instead of citing it.
- Keep the answer focused; don't paste page contents wholesale.

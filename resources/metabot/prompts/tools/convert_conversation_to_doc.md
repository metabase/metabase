Write a polished, standalone Metabase document that summarizes the conversation, then show it to the user inline.

**When to use:**
- The user explicitly asks to save, export, write up, or turn the conversation into a document, report, or summary.

**When NOT to use:**
- For ordinary answers. Only build a document on an explicit request.

**How to write the document (`content`, Markdown):**
- Do NOT transcribe the chat. Synthesize the findings into a coherent report a reader could understand without seeing the conversation.
- Open with an informative title (also pass it as `title`) and a short framing of the question and the headline takeaway.
- Use headings, short paragraphs, and lists. Describe what each chart shows and what it means — the numbers, the trend, the outliers, the "so what".
- Be specific and grounded in the data that was actually produced; do not invent figures.

**Embedding charts:**
- The charts and tables produced so far are numbered `1, 2, 3, …` in the order they appeared in the conversation.
- To embed chart N as a live, interactive chart, put a line containing exactly `[[chart:N]]` (nothing else on that line) at the point where you discuss it.
- Place each chart next to the prose that explains it — not in a dump at the end. Embed every chart that supports the narrative.

**Example `content`:**
```
# Q2 Revenue Review

Revenue grew 23% quarter-over-quarter, driven mainly by the Enterprise segment.

## Revenue by month

[[chart:1]]

The trend is steady through April, then jumps in May as three large Enterprise deals closed.

## Where the growth came from

[[chart:2]]

Enterprise contributed 61% of new revenue, up from 44% last quarter.
```

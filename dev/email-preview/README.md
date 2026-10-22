# Email template preview

A browser-based previewer for the transactional email templates in
`src/metabase/channel/email/*.hbs`, so you can work on email copy and design
without running Metabase or sending real emails.

## Run it

```
bun run email-dev
```

That starts a tiny local server and opens the preview in your browser
(default: http://localhost:8455 — set `PORT` to change it).

## Using it

- **Pick a template** in the left sidebar. The shared header/footer partials
  are included automatically, just like in real emails.
- **Edit the template**: open the `.hbs` file in any editor, save, and the
  preview refreshes by itself (it polls for changes every second).
- **Fill in values**: the *Fields* panel on the right lists every value the
  template receives (`{{applicationName}}`, user names, links, …) as editable
  inputs. The *JSON* tab shows the same data raw, for arrays and adding keys.
  Edits are per-browser (localStorage); *Reset* restores the defaults.
- **Check widths** with the Desktop / Narrow / Phone buttons — email clients
  are usually around 600px.
- **Copy HTML** copies the fully rendered email, e.g. to paste into an email
  client testing tool like Litmus.

## What's a "sample context"?

Each email is rendered from a template plus data supplied by the backend at
send time (the "context"). The defaults in `sample-contexts.js` mirror what
the real send-time code passes, with demo values. If a template gains a new
variable, add a default for it there.

## Fidelity caveats

- Production renders with Java Handlebars (jknack); this tool uses
  handlebars.js. For everything these templates use (`#if`, `#each`, `#with`,
  partials, the custom helpers) the output is the same, but it is a preview,
  not a byte-for-byte reproduction — QA real sends for final signoff.
- Subject lines live in Clojure code (`messages.clj` and the notification
  handlers), not in the templates, so they don't appear here.
- Rendered dashboard/card images in subscription emails are placeholders —
  the real content comes from the visualization renderer at send time.
- `cid:` images (inline attachments, e.g. some icons) show as broken images
  in the browser; they work in real emails.
- What you see is a browser rendering. Email clients (Outlook especially)
  are stricter — the preview is for copy and layout iteration, not client
  compatibility testing.

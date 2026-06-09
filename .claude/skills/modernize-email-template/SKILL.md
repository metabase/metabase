---
name: modernize-email-template
description: Migrate an old Metabase email (.hbs) from the legacy _header/_footer layout to the modern card-style template (_dashsub_alert_header) used by the new-device login and transform-failure emails. Use when asked to restyle, modernize, or improve the look of an existing email/notification template.
---

# Modernize an email to the new card template

Metabase has two generations of HTML email templates under `src/metabase/channel/email/`:

- **Old (legacy)** — wraps content in the `_header.hbs` / `_footer.hbs` partials, uses flat context keys (`applicationName`, `buttonStyle`, `colorTextDark`, `applicationLogoUrl`), and a `.card-container` box with a 2px radius and box-shadow. Looks dated.
- **New (target)** — uses the `_dashsub_alert_header.hbs` partial plus an inline white-card layout on a soft grey background, nested context keys (`context.application_*`, `payload.style.color_text_dark`), a pill-shaped CTA button, an inline footer, and the Metabase, Inc. address block.

Goal: convert one old email to the new look while preserving its content, subject, recipients, and send path.

The rendered target style looks like [example-new-email.png](example-new-email.png) — match this layout (centered logo, grey backdrop, rounded white card, pill button, inline footer + address block).

## Reference files (read these first)

- New header partial: `src/metabase/channel/email/_dashsub_alert_header.hbs`
- Best direct-send example (template + sender): `src/metabase/channel/email/login_from_new_device.hbs` and `send-login-from-new-device-email!` in `src/metabase/channel/email/messages.clj`
- Looping/conditional example: `src/metabase/channel/email/transform_failed.hbs`

## Step 1: Identify the old email and its send path

Locate two things:

1. The `.hbs` template. It is **old** if its first line is `{{> metabase/channel/email/_header.hbs }}` and it ends with `{{> metabase/channel/email/_footer.hbs }}`.
2. The sender. Search `src/metabase/channel/email/messages.clj` (and `notification/seed.clj`) for the template name. There are two send paths — keep whichever the email already uses:

   - **Direct-send** (most legacy emails): a function in `messages.clj` calls `(channel.template/render "metabase/channel/email/<name>.hbs" (merge (common-context) {...}))`. Migration = rewrite template + change this context map.
   - **Notification-system**: a seeded notification in `notification/seed.clj` with `:type "email/handlebars-resource"`. These usually already pass nested `context`/`payload` keys, so often only the `.hbs` needs the layout swap.

This skill focuses on the **direct-send** case (the common legacy case). Note the existing subject line, recipients, and all context keys the template consumes — these must be preserved.

## Step 2: Rewrite the template

Replace the whole file with the card shell below. Keep the old template's actual content (headings, conditionals, links, buttons) but re-style it into this structure. Use nested keys: `{{context.application_name}}`, `{{context.application_color}}`, `{{context.application_logo_url}}`, `{{context.site_url}}`.

```handlebars
{{> metabase/channel/email/_dashsub_alert_header.hbs }}
  <body style="padding: 0px; margin: 0px">
    <table class="background" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F9F9F9; padding: 48px; table-layout: fixed;">
      <tr>
        <td>
          <div class="container" style="background-color: white; max-width: 555px; border-radius: 24px; margin: 0 auto; padding: 40px; border: 1px solid rgba(7, 23, 34, 0.14)">
            <div style="text-align: center; margin-bottom: 32px;">
              <img style="max-height: 45px; max-width: 100%;" src="{{context.application_logo_url}}" alt="{{context.application_name}} logo"/>
            </div>

            {{!-- HEADING: keep the email's original headline/conditionals here --}}
            <h1 style="text-align: center; font-size: 27px; line-height: 36px; font-weight: 400; margin: 0 0 16px 0; color: #2F3C45;">
              ...
            </h1>

            {{!-- BODY: paragraphs, info boxes, loops. Style links with context.application_color --}}
            <p style="text-align: center; font-size: 15px; line-height: 165%; color: #2F3C45; margin: 0;">
              ...
            </p>

            {{!-- Optional grey info box (see login_from_new_device.hbs) --}}
            {{!--
            <div style="background-color: #FAFAFB; border-radius: 12px; padding: 24px; margin: 24px auto 24px auto; text-align: center;">
              ...
            </div>
            --}}

            {{!-- Optional primary CTA button --}}
            <div style="text-align: center; margin-top: 32px;">
              <a href="{{someUrl}}" style="display: inline-block; background-color: {{context.application_color}}; color: #ffffff !important; font-weight: 700; font-size: 14px; border-radius: 8px; padding: 12px 16px; text-decoration: none;">
                ...
              </a>
            </div>

            <hr style="margin-top: 32px; margin-bottom: 32px;">
            <div style="font-size: 12px; line-height: 16px; width: max-content; margin: 0 auto; color: #656F76; text-align: center;">
              Sent from <a href="{{context.site_url}}" style="color: {{context.application_color}}">{{context.site_url}}</a>.
            </div>
          </div>

          <div style="margin-top: 40px;">
            <div style="text-align: center; color: #92999E; font-size: 13px;">
              Metabase, Inc.
            </div>
            <div style="text-align: center; color: #92999E; font-size: 13px;">
              9740 Campo Rd., Suite 1029, Spring Valley, CA 91977
            </div>
            <div style="text-align: center; margin-top: 8px;">
              <a href="https://www.metabase.com" style="color: #656F76 !important; font-size: 13px;">
                www.metabase.com
              </a>
            </div>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
```

Notes:
- Inside `{{#each ...}}` loops, reference outer context with `{{../context.application_color}}`.
- Keep email-specific context keys (e.g. `joinedUserName`, `joinedUserEditUrl`) at the top level — they don't need to move under `context`/`payload`.
- Do NOT add a `_footer.hbs` include; the footer is inlined.

## Step 3: Update the sender context

In the `messages.clj` send function, replace `(merge (common-context) {...})` with the nested shape the new header partial expects (mirror `send-login-from-new-device-email!`). The `_dashsub_alert_header.hbs` partial reads `context.application_color` and `payload.style.color_text_dark`, so both must be present:

```clojure
{:context           {:application_name     (appearance/application-name)
                     :application_color    (channel.render/primary-color)
                     :application_logo_url (logo-url)
                     :site_url             (system/site-url)}
 :payload           {:style {:color_text_dark channel.render/color-text-dark}}
 ;; ...preserve the email's own top-level keys (urls, names, dates, etc.)
 }
```

Drop the now-unused `:logoHeader` flag (the logo is rendered in the card body). Leave the subject line, recipients, and `send-email-with-logo!` call unchanged — `send-email-with-logo!` still attaches a data-URI logo as a CID image.

## Step 4: Verify it renders

Prefer the REPL (`clj-nrepl-eval`) to render the template with a sample context for each branch (e.g. both sides of any conditional). If no REPL is available, run an existing test that exercises the full send/render path — a render error will fail the test:

```bash
./bin/test-agent :only '[metabase.some.namespace-test/the-email-test]'
```

For the user-joined email, that test is `metabase.users.models.user-test/admin-email-on-user-acceptance-test`.

## Step 5 (optional): Screenshot preview

When asked to show the result, render the final HTML and screenshot it:

1. Build the full HTML by inlining the `_dashsub_alert_header.hbs` head (substitute `{{payload.style.color_text_dark}}` → `#4C5773`, `{{context.application_color}}` → `#509EE3`) plus the template body with sample values. Write to `/tmp/email_preview.html`.
2. Serve over localhost (the browser tool blocks `file://`): `python3 -m http.server 8755` from `/tmp` (runs in background; needs `required_permissions: ["all"]`).
3. Navigate the browser MCP to `http://localhost:8755/email_preview.html` and take a full-page screenshot.
4. Kill the server and remove the temp file afterward.

Default brand color is `#509EE3`; `color-text-dark` is `#4C5773` (see `src/metabase/channel/render/style.clj`). The logo can be `https://www.metabase.com/images/logo.svg` for preview purposes.

## Checklist

- [ ] Template starts with `{{> metabase/channel/email/_dashsub_alert_header.hbs }}` and has no `_header`/`_footer` includes
- [ ] Card shell, inline footer, and Metabase address block present (matches `example-new-email.png`)
- [ ] All branding uses nested keys (`context.application_*`, `context.site_url`); links/buttons use `{{context.application_color}}`
- [ ] Original content, conditionals, and links preserved
- [ ] Sender passes `:context` + `:payload.style.color_text_dark`; `:logoHeader` removed; subject/recipients unchanged
- [ ] Render verified via REPL or an existing send-path test

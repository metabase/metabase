# Custom viz sandbox: a plugin can cover the whole viewport (GDGT-2400 / GDGT-2872)

**For:** the custom-viz owners
**From:** Fraser (surfaced by the Playwright e2e migration spike)
**Status:** live on master; not a regression from unknown code — a deliberate
product trade whose security side-effect I want to make sure was weighed.

## The one-sentence version

Untrusted custom-viz plugin code can position its element `fixed; inset: 0`
and cover the entire viewport (a clickjacking / UI-spoofing surface), because
the layout-containment boundary that used to confine it was intentionally
removed on master.

## What happened, in commits

- **#77695** added `SandboxedPluginContainer`, whose CSS module carried
  `contain: layout paint; /* Security boundary */`. Layout containment
  establishes a containing block for `position: fixed` descendants, so a plugin
  that sets `position: fixed; inset: 0` is re-based onto its container instead
  of the viewport — it can't escape its box.
- **#78124 (07cb2f0a6c7, GDGT-2872)** reverted #77695 to let custom-widget
  popovers overflow their container. That revert removed the containment rule
  **and deleted the test that guarded it**, in the same commit.

So on current master there is no boundary and no test. A plugin's
`setInterval(() => el.style = 'position:fixed;inset:0;z-index:99999')` fills
the screen; measured directly, the plugin element's top offset from the
viewport is `0` (unconfined) where it used to be `> 0` (confined).

## Why I'm flagging it rather than just filing a bug

This looks deliberate — the popover-overflow use case is real and the revert
fixed it. The question is whether the security consequence was **explicitly
weighed** or fell out as a side effect. Two things make me think it's worth a
second look:

1. Custom viz plugins are installed deliberately (not reachable by an anonymous
   attacker), which lowers the severity — but a malicious or compromised plugin
   covering the viewport is a genuine clickjacking/spoofing vector for anyone
   who installs one.
2. The trade may not be either/or. #77695's own structure (an outer container
   with the containment boundary, an inner mount for the widget) was already
   shaped so popovers could overflow *and* the boundary held — that component
   still exists in git history. If the popover fix and the boundary can
   coexist, we'd get both back.

## What we did on the test side (so you're not surprised)

The migration spike had ported a test asserting the confinement. We've now
**deleted it to match upstream** (master deleted its equivalent; we stay close
to Cypress). It is recoverable from git history if the boundary is ever
restored — it's the `GDGT-2400 "confines custom viz and custom viz setting
widget to its container"` test in `e2e-playwright/tests/custom-viz.spec.ts`,
and it carries a containment pre-check so it fails fast and honestly on a
boundary-less build rather than racing the attacker's reflow and occasionally
passing.

## The ask

Confirm the GDGT-2872 trade was intentional and the clickjacking/spoofing
consequence was accepted knowingly. If yes, nothing more to do — this note is
the paper trail. If it wasn't fully weighed, the fix already exists in history:
restore #77695's outer-container containment while keeping the popover-overflow
behavior, and re-add a guard test.

## Repro (30 seconds, any EE build)

1. Install a custom-viz plugin whose viz code runs
   `document.querySelectorAll('[data-plugin-sandbox]').forEach(el =>
   el.setAttribute('style','position:fixed;inset:0;z-index:99999;background:red'))`
   on an interval.
2. Open a question using that viz.
3. On a build with the boundary: the red box is confined to the viz container.
   On current master: it covers the whole page.

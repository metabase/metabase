# Cigar-quarterly — storyboard

**Title:** The Sit-Down
**Demo name:** cigar-quarterly
**Presenter:** brando
**Metabase:** http://localhost:3040 (admin `ngoc@slides.local / slides12345!ABC`)
**EE tokens needed:** the Slides feature is on `feat/metabase-slides` — assume yes if gated
**Snapshot:** null (live state on :3040)

**Premise:** A cigar-importer Don walks his capos through a Q4 board review using Metabase Slides. The deck is generated *live* on camera by the AI agent — viewer sees the streaming tool log. The Don narrates over the wait, then walks the finished deck. Bookend endorsements (cold open + closing) are addressed directly to the camera.

**Voice register:** Don Vito Corleone (Marlon Brando) — quiet, gravelly, slow, weary authority. Short declarative sentences. No shouting. Beat 3 is intentionally longer to absorb AI generation wait (~30–60s).

## Beats

0. **Cold open — over `/slides` browse page or Metabase home**
   In my line of work, you need to know your numbers. This? This is Metabase. Beautiful.

1. **Open Slides app → create new deck → editor → click Generate**
   Sit down. We're gonna build something.

2. **In modal: type prompt + pick "FY26 Q4 Board Review" dashboard → click Generate**
   Quarterly review. Numbers don't lie.

3. **Agent log streams (~30–60s wait)**
   Patience. The machine is working. You know — in my time, we wrote this on a notepad. Numbers. Names. Territories. By hand. Now? It does it for you. It thinks. It writes. Beautiful machine.

4. **Deck loaded → Present → slide 2 (revenue YoY)**
   Up thirty-four percent. Good quarter. For most of us.

5. **Slide 3 (top SKUs)**
   Cohibas are moving. Keep them stocked.

6. **Slide 4 (regional) → drill NJ → Big Sal revealed**
   Now. New Jersey. Eighty-two percent. One name. Sal. We need to talk.

7. **Slide 5 (FY27 projection with Sicily)**
   Next year, we go to Sicily. Family business.

8. **Closing — hold on final slide**
   This is how a family stays on top. Metabase. Tell 'em the Don sent you.

## Running precheck against :3040

```
MB_URL=http://localhost:3040 \
MB_USERNAME=ngoc@slides.local \
MB_PASSWORD='slides12345!ABC' \
DEMO_NAME=cigar-quarterly \
node .claude/skills/metabase-feature-demo/references/page-probe.mjs precheck
```

## TTS env (same overrides)

The MiniMax TTS step doesn't talk to Metabase, but the workspace path and presenter pick stay consistent:

```
DEMO_NAME=cigar-quarterly \
node .claude/skills/metabase-feature-demo/references/tts.mjs
```

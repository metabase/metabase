"use strict";
// Pokédex of Accounts — a data app demo.
//
// Plain JS — no JSX, no imports, no build step. The host loads this file as
// text, evaluates it inside a Near Membrane sandbox, and reads the factory
// from globalThis.__customVizPlugin__.
//
// Host-injected globals available inside the sandbox:
//   - React               the host's React instance
//   - MetabaseProvider    SDK provider — wrap the whole app once; pass `theme`
//   - StaticQuestion      SDK static (non-drillable) question view
//   - InteractiveQuestion SDK drillable question view
//
// The "Pokémon" framing is decorative: each card wraps a saved Metabase
// question in a themed shell. Edit the POKEMON_TEAM array below to point at
// question IDs that exist on your instance.
(function () {
  var POKEMON_TEAM = [
    {
      id: 1,
      name: "Charizard",
      type: "Fire",
      pokedex: "#006",
      color: "#F08030",
      tint: "#FFE2C8",
      emoji: "🔥",
      tagline: "Top-tier customers blazing through orders.",
      stats: { HP: 78, ATK: 84, DEF: 78, SPD: 100 },
      questionId: 1,
    },
    {
      id: 2,
      name: "Blastoise",
      type: "Water",
      pokedex: "#009",
      color: "#6890F0",
      tint: "#D6E1FB",
      emoji: "💧",
      tagline: "Steady, reliable accounts with deep reserves.",
      stats: { HP: 79, ATK: 83, DEF: 100, SPD: 78 },
      questionId: 2,
    },
    {
      id: 3,
      name: "Venusaur",
      type: "Grass",
      pokedex: "#003",
      color: "#78C850",
      tint: "#DCEFCB",
      emoji: "🌿",
      tagline: "Slow growers — long tail of repeat business.",
      stats: { HP: 80, ATK: 82, DEF: 83, SPD: 80 },
      questionId: 3,
    },
    {
      id: 4,
      name: "Pikachu",
      type: "Electric",
      pokedex: "#025",
      color: "#F8D030",
      tint: "#FBEFB7",
      emoji: "⚡",
      tagline: "Small accounts, high frequency, big spikes.",
      stats: { HP: 35, ATK: 55, DEF: 40, SPD: 90 },
      questionId: 4,
    },
    {
      id: 5,
      name: "Mewtwo",
      type: "Psychic",
      pokedex: "#150",
      color: "#A040A0",
      tint: "#E4CFE4",
      emoji: "🔮",
      tagline: "Enterprise outliers — hard to predict, high impact.",
      stats: { HP: 106, ATK: 110, DEF: 90, SPD: 130 },
      questionId: 5,
    },
    {
      id: 6,
      name: "Gengar",
      type: "Ghost",
      pokedex: "#094",
      color: "#705898",
      tint: "#D9CCE3",
      emoji: "👻",
      tagline: "Churn risks lurking in the shadows.",
      stats: { HP: 60, ATK: 65, DEF: 60, SPD: 110 },
      questionId: 6,
    },
  ];

  function el() {
    var React = globalThis.React;
    return React.createElement.apply(React, arguments);
  }

  // PokéAPI hosts canonical Pokémon artwork at predictable URLs keyed by
  // National Dex number. We derive the ID from the `pokedex` field ("#006" → 6)
  // so the team data stays compact.
  //
  // This relies on Metabase's CSP `img-src` allowing https sources — image
  // loads via <img> happen at the browser level, not through the sandbox's
  // fetch (which is blocked), so this is a passive resource load.
  function spriteUrl(p) {
    var id = parseInt(p.pokedex.replace(/^#/, ""), 10);
    return (
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/" +
      id +
      ".png"
    );
  }

  function TypeBadge(props) {
    return el(
      "span",
      {
        style: {
          background: props.pokemon.color,
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.6,
          padding: "3px 10px",
          borderRadius: 999,
          textTransform: "uppercase",
        },
      },
      props.pokemon.type,
    );
  }

  function StatBar(props) {
    var pct = Math.min(100, Math.round((props.value / 150) * 100));
    return el(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 } },
      el("div", { style: { width: 36, color: "#555", fontWeight: 600 } }, props.label),
      el(
        "div",
        {
          style: {
            flex: 1,
            background: "#eee",
            borderRadius: 4,
            height: 8,
            overflow: "hidden",
          },
        },
        el("div", {
          style: {
            width: pct + "%",
            height: "100%",
            background: props.color,
            transition: "width 240ms ease",
          },
        }),
      ),
      el("div", { style: { width: 28, textAlign: "right", color: "#333" } }, props.value),
    );
  }

  function PokemonCard(props) {
    var p = props.pokemon;
    var isSelected = props.isSelected;
    return el(
      "button",
      {
        onClick: function () {
          props.onSelect(p);
        },
        style: {
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 12,
          background: isSelected ? p.tint : "white",
          border: "2px solid " + (isSelected ? p.color : "#e5e5e5"),
          borderRadius: 12,
          cursor: "pointer",
          width: "100%",
          boxShadow: isSelected
            ? "0 6px 16px rgba(0,0,0,0.08)"
            : "0 1px 2px rgba(0,0,0,0.04)",
          transition: "all 160ms ease",
        },
      },
      el(
        "div",
        {
          style: {
            width: 48,
            height: 48,
            borderRadius: 12,
            background:
              "linear-gradient(135deg, " + p.color + ", " + p.tint + ")",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
          },
        },
        el("img", {
          src: spriteUrl(p),
          alt: p.name,
          width: 44,
          height: 44,
          style: { objectFit: "contain", display: "block" },
        }),
      ),
      el(
        "div",
        { style: { flex: 1, minWidth: 0 } },
        el(
          "div",
          { style: { display: "flex", alignItems: "baseline", gap: 8 } },
          el(
            "span",
            { style: { fontSize: 11, color: "#999", fontFamily: "monospace" } },
            p.pokedex,
          ),
          el(
            "span",
            { style: { fontSize: 16, fontWeight: 700, color: "#222" } },
            p.name,
          ),
        ),
        el("div", { style: { marginTop: 4 } }, el(TypeBadge, { pokemon: p })),
      ),
    );
  }

  function StatsPanel(props) {
    var p = props.pokemon;
    var rows = [
      { label: "HP", value: p.stats.HP, color: "#88C674" },
      { label: "ATK", value: p.stats.ATK, color: "#F08030" },
      { label: "DEF", value: p.stats.DEF, color: "#6890F0" },
      { label: "SPD", value: p.stats.SPD, color: "#F8D030" },
    ];
    return el(
      "div",
      {
        style: {
          background: "white",
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        },
      },
      el(
        "div",
        { style: { fontSize: 12, fontWeight: 700, color: "#666", letterSpacing: 0.8 } },
        "BASE STATS",
      ),
      rows.map(function (row) {
        return el(StatBar, {
          key: row.label,
          label: row.label,
          value: row.value,
          color: row.color,
        });
      }),
    );
  }

  function PokemonDetail(props) {
    var p = props.pokemon;
    var StaticQuestion = globalThis.StaticQuestion;
    return el(
      "section",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 16,
          background: "linear-gradient(180deg, " + p.tint + " 0%, #fafafa 220px)",
          padding: 24,
          borderRadius: 16,
        },
      },
      el(
        "header",
        { style: { display: "flex", alignItems: "center", gap: 20 } },
        el(
          "div",
          {
            style: {
              width: 96,
              height: 96,
              borderRadius: 20,
              background: "linear-gradient(135deg, " + p.color + ", white)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            },
          },
          el("img", {
            src: spriteUrl(p),
            alt: p.name,
            width: 88,
            height: 88,
            style: { objectFit: "contain", display: "block" },
          }),
        ),
        el(
          "div",
          { style: { flex: 1 } },
          el(
            "div",
            { style: { fontSize: 12, color: "#999", fontFamily: "monospace" } },
            p.pokedex,
          ),
          el(
            "h1",
            { style: { margin: "2px 0 8px", fontSize: 32, color: "#222" } },
            p.name,
          ),
          el(TypeBadge, { pokemon: p }),
          el(
            "p",
            { style: { marginTop: 12, color: "#555", maxWidth: 480 } },
            p.tagline,
          ),
        ),
      ),
      el(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "minmax(240px, 280px) 1fr",
            gap: 16,
          },
        },
        el(StatsPanel, { pokemon: p }),
        el(
          "div",
          {
            style: {
              background: "white",
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 16,
              minHeight: 360,
            },
          },
          el(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              },
            },
            el(
              "div",
              { style: { fontSize: 12, fontWeight: 700, color: "#666", letterSpacing: 0.8 } },
              "ACCOUNT ANALYTICS",
            ),
            el(
              "div",
              { style: { fontSize: 11, color: "#999" } },
              "Question #" + p.questionId,
            ),
          ),
          el(
            "div",
            { style: { height: 360, overflow: "hidden" } },
            el(StaticQuestion, {
              questionId: p.questionId,
              withChartTypeSelector: false,
              // SDK components don't auto-fit their parent; pass an explicit
              // height so FlexibleSizeComponent sizes the chart correctly.
              height: "100%",
              width: "100%",
            }),
          ),
        ),
      ),
    );
  }

  function App() {
    var React = globalThis.React;
    var MetabaseProvider = globalThis.MetabaseProvider;
    var s = React.useState(POKEMON_TEAM[0]);
    var selected = s[0];
    var setSelected = s[1];

    // SDK theme: only fields the SDK actually understands (see
    // MetabaseColors / MetabaseTheme). Per the SDK docs, `text-primary` and
    // `background` are SDK-internal (text on dark elements, default component
    // bg) — not page chrome. Putting page-chrome values there forces the SDK
    // to render those colors on its own surfaces and breaks the layout.
    //
    // The bundle's POKEMON_TEAM is the source of truth for color identity;
    // both the chrome and the SDK derive from the selected entry.
    var sdkTheme = {
      colors: {
        brand: selected.color,
        "brand-hover": selected.color,
        positive: selected.color,
        // Palette: brand only. Avoid putting `selected.tint` here — tints are
        // background-grade pale colors and render as "white" for any series
        // or label that lands on palette index 1+.
        charts: [selected.color],
        // SDK component surface — matches the white card that wraps the
        // chart. The page itself is `selected.tint`, but the chart's
        // immediate parent is the white panel inside PokemonDetail.
        background: "white",
        "background-secondary": "white",
        // Text on the SDK surface. The doc string for `text-primary` reads
        // "for dark elements" but in practice the SDK pipes it into
        // `--mantine-color-text-primary-0` and uses it as the chart's
        // primary text token regardless of background. Default resolves to
        // ~white, so we override to dark for legibility on the white
        // surface above.
        "text-primary": "#1f2937",
        "text-secondary": "#4b5563",
        "text-tertiary": "#6b7280",
      },
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
    };

    return el(
      MetabaseProvider,
      { theme: sdkTheme },
      el(
        "div",
        {
          style: {
            fontFamily: sdkTheme.fontFamily,
            background: selected.tint,
            minHeight: "100vh",
            padding: 24,
            color: "#222",
            transition: "background 240ms ease",
          },
        },
      el(
        "header",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          },
        },
        el(
          "div",
          {
            style: {
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, #EE1515, #B40000)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              boxShadow: "0 6px 16px rgba(238,21,21,0.30)",
            },
          },
          "🎮",
        ),
        el(
          "div",
          null,
          el(
            "h1",
            { style: { margin: 0, fontSize: 28, color: "#111" } },
            "Pokédex of Accounts",
          ),
          el(
            "p",
            { style: { margin: "4px 0 0", color: "#666" } },
            "Every account is a Pokémon. Pick one to study its stats.",
          ),
        ),
      ),
      el(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "300px 1fr",
            gap: 24,
            alignItems: "start",
          },
        },
        el(
          "aside",
          {
            style: { display: "flex", flexDirection: "column", gap: 8 },
          },
          POKEMON_TEAM.map(function (p) {
            return el(PokemonCard, {
              key: p.id,
              pokemon: p,
              isSelected: selected.id === p.id,
              onSelect: setSelected,
            });
          }),
        ),
        el(PokemonDetail, { pokemon: selected }),
      ),
      ),
    );
  }

  globalThis.__customVizPlugin__ = function factory(_hostApi) {
    return { component: App };
  };
})();

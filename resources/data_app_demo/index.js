"use strict";
// Pokemon data-app bundle. Plain JS, no JSX, no imports, no build step.
// The host evaluates this text inside a Near Membrane sandbox and renders
// the returned component inside its own React tree.
//
// Host-injected globals:
//   - React               the host's React instance
//   - MetabaseProvider    SDK provider — wrap the whole app once; pass `theme`
//   - StaticQuestion      SDK static (non-drillable) question
//   - InteractiveQuestion SDK drillable question
(function () {
  function el() {
    var React = globalThis.React;
    return React.createElement.apply(React, arguments);
  }

  // Public Pokemon images come from the PokeAPI sprite repo on GitHub —
  // stable URLs, no API key, served over HTTPS.
  function spriteUrl(id) {
    return (
      "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/" +
      id +
      ".png"
    );
  }

  // Edit this list to change which Pokemon show up. `questionId` should point
  // at a real Metabase question on the target instance — they can all share
  // one question, or each Pokemon can have its own.
  var POKEMON = [
    {
      id: 1,
      name: "Bulbasaur",
      types: ["Grass", "Poison"],
      color: "#78C850",
      tagline: "Seed Pokémon",
      questionId: 1,
    },
    {
      id: 4,
      name: "Charmander",
      types: ["Fire"],
      color: "#F08030",
      tagline: "Lizard Pokémon",
      questionId: 1,
    },
    {
      id: 7,
      name: "Squirtle",
      types: ["Water"],
      color: "#6890F0",
      tagline: "Tiny Turtle Pokémon",
      questionId: 1,
    },
    {
      id: 25,
      name: "Pikachu",
      types: ["Electric"],
      color: "#F8D030",
      tagline: "Mouse Pokémon",
      questionId: 1,
    },
    {
      id: 39,
      name: "Jigglypuff",
      types: ["Normal", "Fairy"],
      color: "#EE99AC",
      tagline: "Balloon Pokémon",
      questionId: 1,
    },
    {
      id: 150,
      name: "Mewtwo",
      types: ["Psychic"],
      color: "#F85888",
      tagline: "Genetic Pokémon",
      questionId: 1,
    },
  ];

  function Hero() {
    return el(
      "header",
      {
        style: {
          padding: "32px 24px",
          textAlign: "center",
          background: "linear-gradient(135deg, #4D96FF 0%, #6890F0 100%)",
          color: "white",
        },
      },
      el(
        "h1",
        { style: { margin: 0, fontSize: 36, letterSpacing: -0.5 } },
        "Pokédex Analytics",
      ),
      el(
        "p",
        { style: { margin: "8px 0 0", opacity: 0.9, fontSize: 16 } },
        "Embedded Metabase questions, one per Pokémon.",
      ),
    );
  }

  function TypePill(props) {
    return el(
      "span",
      {
        style: {
          display: "inline-block",
          padding: "2px 10px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.25)",
          color: "white",
          fontSize: 12,
          fontWeight: 600,
          marginRight: 6,
        },
      },
      props.label,
    );
  }

  function PokemonCard(props) {
    var StaticQuestion = globalThis.StaticQuestion;
    var p = props.pokemon;

    return el(
      "article",
      {
        style: {
          background: "white",
          border: "1px solid #eee",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        },
      },
      // Banner with sprite + name + types.
      el(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: 20,
            background: p.color,
            color: "white",
          },
        },
        el("img", {
          src: spriteUrl(p.id),
          alt: p.name,
          width: 96,
          height: 96,
          style: {
            background: "rgba(255,255,255,0.2)",
            borderRadius: "50%",
            objectFit: "contain",
          },
        }),
        el(
          "div",
          { style: { flex: 1, minWidth: 0 } },
          el(
            "div",
            { style: { fontSize: 12, opacity: 0.8, fontWeight: 600 } },
            "#" + String(p.id).padStart(3, "0"),
          ),
          el("h2", { style: { margin: "2px 0 6px", fontSize: 24 } }, p.name),
          el(
            "div",
            { style: { fontSize: 13, opacity: 0.9, marginBottom: 8 } },
            p.tagline,
          ),
          el.apply(
            null,
            ["div", { style: { display: "flex", flexWrap: "wrap" } }].concat(
              p.types.map(function (t, i) {
                return el(TypePill, { key: i, label: t });
              }),
            ),
          ),
        ),
      ),
      // Embedded question.
      el(
        "div",
        { style: { padding: 16 } },
        el(
          "div",
          {
            style: {
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              color: "#6b7280",
              marginBottom: 8,
            },
          },
          "Stats",
        ),
        el(
          "div",
          { style: { height: 280, overflow: "hidden" } },
          el(StaticQuestion, {
            questionId: p.questionId,
            withChartTypeSelector: false,
            height: "100%",
            width: "100%",
          }),
        ),
      ),
    );
  }

  function App() {
    var React = globalThis.React;
    var MetabaseProvider = globalThis.MetabaseProvider;

    // SDK theme — the chart sits inside a white card, so the SDK background
    // must be white and text-primary must be dark for contrast.
    var sdkTheme = {
      colors: {
        brand: "#4D96FF",
        "brand-hover": "#4D96FF",
        positive: "#4D96FF",
        charts: [
          "#4D96FF",
          "#F08030",
          "#78C850",
          "#F85888",
          "#A040A0",
          "#F8D030",
        ],
        background: "white",
        "background-secondary": "white",
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
        { style: { minHeight: "100vh", background: "#f5f5f7" } },
        el(Hero),
        el.apply(
          null,
          [
            "main",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: 20,
                padding: 24,
                maxWidth: 1280,
                margin: "0 auto",
              },
            },
          ].concat(
            POKEMON.map(function (p) {
              return el(PokemonCard, { key: p.id, pokemon: p });
            }),
          ),
        ),
      ),
    );
  }

  globalThis.__customVizPlugin__ = function factory(_hostApi) {
    return { component: App };
  };
})();

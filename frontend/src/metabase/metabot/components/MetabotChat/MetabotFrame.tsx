import { useEffect, useState } from "react";

import { Box, Icon, Menu, Paper, Text } from "metabase/ui";

import Styles from "./MetabotFrame.module.css";

type MetabotDefinition = {
  name: string;
  price: string;
  description: string;
  url: string;
  imageName: string;
};

const createMetabot = (
  name: string,
  price: string,
  description: string,
  imageName: string,
): MetabotDefinition => ({
  name,
  price,
  description,
  imageName,
  url: `app/assets/img/metabots/${imageName}.png`,
});

export const metabots = {
  abstract: createMetabot(
    `Abstract Metabot`,
    `32 metacoins`,
    `For when you want your Metabot to be as enigmatic as the insights it provides.`,
    "abstract",
  ),
  ancient: createMetabot(
    `Ancient Metabot`,
    `41 metacoins`,
    `Speaks in prophecies, forgotten joins, and suspiciously accurate retention forecasts.`,
    "ancient",
  ),
  artist: createMetabot(
    `Artist Metabot`,
    `29 metacoins`,
    `Turns every result set into a masterpiece and every outlier into a creative choice.`,
    "artist",
  ),
  astronaut: createMetabot(
    `Astronaut Metabot`,
    `58 metacoins`,
    `Built for zero-gravity brainstorming, moonshot funnels, and dashboards with orbital ambition.`,
    "astronaut",
  ),
  chef: createMetabot(
    `Chef Metabot`,
    `36 metacoins`,
    `Whisks raw tables into plated insights with a pinch of seasoning and a lot of aggregation.`,
    "chef",
  ),
  cloud: createMetabot(
    `Cloud Metabot`,
    `26 metacoins`,
    `Floats above the schema dispensing breezy forecasts and cumulonimbus-level optimism.`,
    "cloud",
  ),
  cook: createMetabot(
    `Cook Metabot`,
    `24 metacoins`,
    `Less haute cuisine, more weeknight query wizardry with dependable results and excellent timing.`,
    "cook",
  ),
  fancy: createMetabot(
    `Fancy Metabot`,
    `47 metacoins`,
    `Arrives overdressed, overprepared, and fully committed to elegant pivots.`,
    "fancy",
  ),
  gardener: createMetabot(
    `Gardener Metabot`,
    `31 metacoins`,
    `Prunes noisy dimensions, waters promising leads, and helps healthy metrics bloom.`,
    "gardener",
  ),
  glitch: createMetabot(
    `Glitch Metabot`,
    `39 metacoins`,
    `A delightfully unstable companion for experimental prompts and beautifully broken aesthetics.`,
    "glitch",
  ),
  kid: createMetabot(
    `Kid Metabot`,
    `17 metacoins`,
    `Asks why five times, finds the real question, and celebrates every chart like a birthday party.`,
    "kid",
  ),
  melt: createMetabot(
    `Melt Metabot`,
    `28 metacoins`,
    `Soft around the edges, dramatic in presentation, and extremely serious about anomaly detection.`,
    "melt",
  ),
  party: createMetabot(
    `Party Metabot`,
    `44 metacoins`,
    `Brings confetti energy to weekly reporting and insists every launch metric deserves a dance break.`,
    "party",
  ),
  pirate: createMetabot(
    `Pirate Metabot`,
    `35 metacoins`,
    `Hunts buried treasure in your warehouse and absolutely will call your KPIs booty.`,
    "pirate",
  ),
  vanilla: createMetabot(
    `Vanilla Metabot`,
    `12 metacoins`,
    `A classic, dependable bot for purists who like their insights smooth, clean, and unpretentious.`,
    "vanilla",
  ),
  sherlock: createMetabot(
    `Sherlock Metabot`,
    `53 metacoins`,
    `Obsessively inspects every clue, every filter, and every mysteriously declining trend.`,
    "sherlock",
  ),
  sir: createMetabot(
    `Sir Metabot`,
    `33 metacoins`,
    `Polite, formal, and quietly judgmental about malformed SQL and missing labels.`,
    "sir",
  ),
  sleepy: createMetabot(
    `Sleepy Metabot`,
    `19 metacoins`,
    `Moves at a yawn, thinks at a dream, and still manages to ship suspiciously good answers.`,
    "sleepy",
  ),
  steampunk: createMetabot(
    `Steampunk Metabot`,
    `49 metacoins`,
    `Powered by brass gears, hot steam, and an unnecessarily elaborate approach to slice-and-dice analysis.`,
    "steampunk",
  ),
  stone_age: createMetabot(
    `Stone Age Metabot`,
    `22 metacoins`,
    `Carves insights into metaphorical cave walls using only grit, instinct, and sturdy dimensions.`,
    "stone_age",
  ),
  superhero: createMetabot(
    `Superhero Metabot`,
    `61 metacoins`,
    `Swoops in when dashboards are in danger and saves the day with dramatic executive summaries.`,
    "superhero",
  ),
  victorian: createMetabot(
    `Victorian Metabot`,
    `45 metacoins`,
    `Elegant, verbose, and fond of turning simple KPI updates into serialized literature.`,
    "victorian",
  ),
  viking: createMetabot(
    `Viking Metabot`,
    `52 metacoins`,
    `Raids unruly datasets, conquers messy dashboards, and toasts every successful deploy.`,
    "viking",
  ),
  wizard: createMetabot(
    `Wizard Metabot`,
    `57 metacoins`,
    `Conjures predictive wisdom, enchanted charts, and the occasional inexplicable but correct query.`,
    "wizard",
  ),
} as const satisfies Record<string, MetabotDefinition>;

export type MetabotVariant = keyof typeof metabots;

export const isMetabotVariant = (value: string): value is MetabotVariant =>
  value in metabots;

const getQuips = () => [
  `Did you know you can filter by clicking on a chart?`,
  `Aggregations are just vibes, statistically speaking.`,
  `Have you tried asking me a question today?`,
  `This dashboard is looking particularly dashboardy.`,
  `SQL stands for Surprisingly Quirky Language.`,
  `Your data called. It wants to be visualized.`,
  `I counted all your rows. You have a lot of rows.`,
  `Joins: the duct tape of database queries.`,
  `Pro tip: naming things is the hardest part of analytics.`,
  `I believe in you and your query.`,
  `Null values are just data on vacation.`,
  `Every great dashboard starts with a single question.`,
  `Fun fact: I eat tokens for breakfast.`,
  `If this chart had a soundtrack, it would be dramatic synthwave.`,
  `I ran a quick vibe check on your KPIs. They passed.`,
  `Somewhere, a CSV is dreaming of becoming a dashboard.`,
  `This filter is doing more heavy lifting than my gym routine.`,
  `I bring the whimsy. You bring the business questions.`,
  `Your funnel called; it wants fewer mysterious drop-offs.`,
  `Hot take: a well-labeled axis is peak luxury.`,
  `I can neither confirm nor deny I benchmark for compliments.`,
  `Another day, another beautifully suspicious spike.`,
  `If uncertainty had a chart type, it would still need a legend.`,
  `I put the "bot" in "bottom-line clarity."`,
  `Tiny query tweak, massive main-character energy.`,
  `Legend says the cleanest data model appears at quarter end.`,
];

export function MetabotFrame({
  variant = "vanilla",
}: {
  variant?: MetabotVariant;
}) {
  const quips = getQuips();
  const [quipIndex, setQuipIndex] = useState(() =>
    Math.floor(Math.random() * quips.length),
  );
  const [visible, setVisible] = useState(true);
  const [isClosed, setIsClosed] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  const closeFrame = () => {
    setIsClosed(true);
    setIsActionsMenuOpen(false);
  };

  useEffect(() => {
    if (isClosed) {
      return;
    }

    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setQuipIndex((i) => (i + 1) % quips.length);
        setVisible(true);
      }, 400);
    }, 6000);

    return () => clearInterval(interval);
  }, [isClosed, quips.length]);

  if (isClosed) {
    return null;
  }

  return (
    <Box className={Styles.frame} data-testid="metabot-frame">
      <Box className={Styles.bubbleWrapper}>
        <Paper
          className={Styles.bubble}
          data-visible={visible}
          shadow="sm"
          p="sm"
          radius="md"
        >
          <Text fz="sm" lh="sm" c="text-primary">
            {quips[quipIndex]}
          </Text>
        </Paper>
      </Box>
      <Menu
        opened={isActionsMenuOpen}
        onChange={setIsActionsMenuOpen}
        position="top-end"
      >
        <Menu.Target>
          <Box
            className={Styles.botWrapper}
            onContextMenu={(event) => {
              event.preventDefault();
              setIsActionsMenuOpen(true);
            }}
          >
            <MetabotImage variant={variant} />
          </Box>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item leftSection={<Icon name="close" />} onClick={closeFrame}>
            {`Close Metabot`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}

export const MetabotImage = ({
  variant,
  bg,
}: {
  variant: MetabotVariant;
  bg?: "transparent";
}) => {
  const metabot = metabots[variant] ?? metabots.vanilla;

  return (
    <Box
      bg={bg ?? "background-primary"}
      bdrs="lg"
      bd={bg ? undefined : "2px solid var(--mb-color-border)"}
      p="sm"
      ta="center"
    >
      <img src={metabot.url} alt={metabot.name} style={{ width: "6rem" }} />
    </Box>
  );
};

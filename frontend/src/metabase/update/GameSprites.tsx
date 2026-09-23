import { Icon } from "metabase/ui";

const SPRITE_PROPS = {
  width: "100%",
  height: "100%",
  preserveAspectRatio: "none",
  shapeRendering: "crispEdges",
  display: "block",
  "aria-hidden": true,
  focusable: false,
} as const;

const ARROW_ROTATIONS = { up: 0, right: 90, down: 180, left: 270 } as const;

export function KonamiArrowSprite({
  direction,
}: {
  direction: keyof typeof ARROW_ROTATIONS;
}) {
  return (
    <svg
      {...SPRITE_PROPS}
      width="1em"
      height="1em"
      viewBox="0 0 9 9"
      fill="currentColor"
    >
      <path
        transform={`rotate(${ARROW_ROTATIONS[direction]} 4.5 4.5)`}
        d="M4 0h1v1h1v1h1v1h1v1H6v5H3V4H1V3h1V2h1V1h1Z"
      />
    </svg>
  );
}

export function MetabotShipSprite() {
  return (
    <svg
      {...SPRITE_PROPS}
      viewBox="0 0 96 72"
      shapeRendering="geometricPrecision"
    >
      <path
        fill="var(--mb-color-core-blue-saturated)"
        d="M48 0 66 29 96 56v9l-24-6-6 7H30l-6-7L0 65v-9l30-27Z"
      />
      <path
        fill="var(--mb-color-core-brand)"
        d="m48 0 16 29 27 26-22-5-7 12H34l-7-12-22 5 27-26Z"
      />
      <path
        fill="var(--mb-color-icon-brand-inverse)"
        d="m48 0 6 24H42ZM30 33l-3 12-17 8Zm36 0 20 20-17-8Z"
      />
      <path
        fill="var(--mb-color-core-white_constant)"
        d="m48 3 2 17h-4ZM18 49l9-5-1 4-9 4Zm60 0 1 3-9-4-1-4Z"
      />
      <rect
        x="25"
        y="22"
        width="46"
        height="36"
        rx="9"
        fill="var(--mb-color-core-blue-saturated)"
      />
      <Icon
        name="metabot"
        x={26}
        y={18}
        size={44}
        color="core-white_constant"
        aria-hidden
      />
      <path fill="var(--mb-color-icon-brand-inverse)" d="M39 61h18v2H39z" />
      <path
        fill="var(--mb-color-core-blue-saturated)"
        d="M20 57h10v8H20zM66 57h10v8H66z"
      />
      <path
        fill="var(--mb-color-core-yellow-saturated)"
        d="m21 65 4 7 4-7Zm46 0 4 7 4-7Z"
      />
      <path
        fill="var(--mb-color-core-white_constant)"
        d="m23 65 2 4 2-4Zm46 0 2 4 2-4Z"
      />
    </svg>
  );
}

const HACKER_HEADS = {
  bandit: (
    <>
      <path d="M12 1h8v2h2v4H10V3h2z" />
      <path fill="var(--mb-color-core-info)" d="M10 5h12v2H10z" />
      <path
        fill="var(--mb-color-accent3-light)"
        d="M10 7h12v5h-2v2h-2v2h-4v-2h-2v-2h-2z"
      />
      <path d="M10 8h12v4H10z" />
      <path
        fill="var(--mb-color-core-white_constant)"
        d="M12 9h2v1h-2zM18 9h2v1h-2z"
      />
    </>
  ),
  fedora: (
    <>
      <path d="M11 1h4v1h2V1h4v2h2v3h3v2H6V6h3V3h2z" />
      <path fill="var(--mb-color-core-info)" d="M9 5h14v1H9z" />
      <path fill="var(--mb-color-accent3-light)" d="M9 8h14v4h-2v2H11v-2H9z" />
      <path d="M9 8h14v3h-5v-1h-4v1H9zM11 13h10v3H11z" />
      <path
        fill="var(--mb-color-core-green-saturated)"
        d="M10 9h3v1h-1v1h-2zM19 9h3v1h-1v1h-2z"
      />
    </>
  ),
  balaclava: (
    <>
      <path d="M13 1h6v2h2v3h2v6h-2v3h-3v1h-4v-1h-3v-3H9V6h2V3h2z" />
      <path fill="var(--mb-color-accent3-light)" d="M12 9h8v2h-8z" />
      <path
        fill="var(--mb-color-core-white_constant)"
        d="M13 9h2v1h-2zM17 9h2v1h-2z"
      />
      <path d="M14 9h1v1h-1zM18 9h1v1h-1z" />
    </>
  ),
  hood: (
    <>
      <path d="M15 2h3v1h3v2h2v4h2v7H7V9h2V5h3V3h3z" />
      <path fill="var(--mb-color-accent3-light)" d="M11 13h10v3H11z" />
      <path
        fill="var(--mb-color-core-white_constant)"
        d="M12 13h2v1h-2zM18 13h2v1h-2z"
      />
      <path d="M13 13h1v1h-1zM18 13h1v1h-1z" />
    </>
  ),
};

export function HackerSprite({
  variant,
}: {
  variant: keyof typeof HACKER_HEADS;
}) {
  return (
    <svg {...SPRITE_PROPS} viewBox="0 0 32 36" preserveAspectRatio="none">
      <g fill="var(--mb-color-background_page-secondary-inverse)">
        {HACKER_HEADS[variant]}
        <path d="M4 16h24v7h2v3h1v8H1v-8h1v-3h2z" />
      </g>
      <g transform="translate(8 18) scale(0.5)">
        <path fill="var(--mb-color-core-info)" d="M4 16h24v20H4z" />
        <path fill="var(--mb-color-text-secondary-opaque)" d="M4 33h24v2H4z" />
      </g>
    </svg>
  );
}

export const INVADER_SPRITES = [
  <HackerSprite key="bandit" variant="bandit" />,
  <HackerSprite key="fedora" variant="fedora" />,
  <HackerSprite key="balaclava" variant="balaclava" />,
  <HackerSprite key="hood" variant="hood" />,
] as const;

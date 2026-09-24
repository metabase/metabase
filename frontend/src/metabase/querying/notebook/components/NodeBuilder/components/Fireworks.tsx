import { type CSSProperties, useEffect, useMemo, useState } from "react";

import S from "./Fireworks.module.css";

type FireworksProps = {
  // Bumped on every launch; zero means nothing to show.
  burstKey: number;
};

const BURSTS = 7;
const SPARKS_PER_BURST = 16;
const TWINKLES = 28;
// Covers the last burst's delay plus its sparks, see Fireworks.module.css.
const SHOW_DURATION_MS = 2200;

const COLORS = [
  "var(--mb-color-accent0)",
  "var(--mb-color-accent1)",
  "var(--mb-color-accent2)",
  "var(--mb-color-accent4)",
  "var(--mb-color-accent6)",
  // Prettify's pink, defined on the builder root in NodeBuilder.module.css.
  "var(--builder-sparkle)",
];

type Spark = { dx: number; dy: number; size: number; color: string };
type Burst = { x: number; y: number; delay: number; sparks: Spark[] };
type Twinkle = {
  x: number;
  y: number;
  delay: number;
  size: number;
  color: string;
};

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

function makeShow(): { bursts: Burst[]; twinkles: Twinkle[] } {
  const bursts = Array.from({ length: BURSTS }, (_, index) => ({
    x: between(8, 92),
    y: between(10, 85),
    delay: index * 140 + between(0, 120),
    sparks: Array.from({ length: SPARKS_PER_BURST }, (_, sparkIndex) => {
      const angle =
        (sparkIndex / SPARKS_PER_BURST) * Math.PI * 2 + between(-0.2, 0.2);
      const distance = between(50, 130);
      return {
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        size: between(4, 8),
        color: pickColor(),
      };
    }),
  }));
  const twinkles = Array.from({ length: TWINKLES }, () => ({
    x: between(2, 98),
    y: between(4, 96),
    delay: between(0, 1000),
    size: between(10, 22),
    color: pickColor(),
  }));
  return { bursts, twinkles };
}

// A short firework show over the canvas, one burst after another, then gone.
export function Fireworks({ burstKey }: FireworksProps) {
  const [isVisible, setIsVisible] = useState(false);
  const show = useMemo(() => (burstKey > 0 ? makeShow() : null), [burstKey]);

  useEffect(() => {
    if (burstKey === 0) {
      return;
    }
    setIsVisible(true);
    const timer = window.setTimeout(
      () => setIsVisible(false),
      SHOW_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [burstKey]);

  if (!isVisible || !show) {
    return null;
  }

  return (
    <div className={S.overlay} aria-hidden data-testid="node-builder-fireworks">
      {show.bursts.map((burst, burstIndex) => (
        <div
          key={burstIndex}
          className={S.burst}
          style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
        >
          <span
            className={S.flash}
            style={{ animationDelay: `${burst.delay}ms` }}
          />
          {burst.sparks.map((spark, sparkIndex) => {
            // CSS custom properties are not part of React's CSSProperties type.
            const sparkStyle = {
              "--dx": `${spark.dx}px`,
              "--dy": `${spark.dy}px`,
              width: spark.size,
              height: spark.size,
              background: spark.color,
              animationDelay: `${burst.delay}ms`,
            } as CSSProperties;
            return (
              <span key={sparkIndex} className={S.spark} style={sparkStyle} />
            );
          })}
        </div>
      ))}
      {show.twinkles.map((twinkle, index) => (
        <span
          key={index}
          className={S.twinkle}
          style={{
            left: `${twinkle.x}%`,
            top: `${twinkle.y}%`,
            width: twinkle.size,
            height: twinkle.size,
            background: twinkle.color,
            animationDelay: `${twinkle.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

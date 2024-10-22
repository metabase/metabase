export const transitions = {
  chatBarSlideIn: {
    in: { opacity: 1, transform: "translate(-50%, 0)" },
    out: { opacity: 0, transform: "translate(-50%, 2rem)" },
    common: { transformOrigin: "top" },
    transitionProperty: "transform, opacity",
  },
  messageSlideIn: {
    in: { opacity: 1, transform: "translate(0, 0)" },
    out: { opacity: 0, transform: "translate(0, .5rem)" },
    common: { transformOrigin: "top" },
    transitionProperty: "transform, opacity",
  },
};

import originalStyled from "@emotion/styled";

type StylesParameters = Parameters<typeof originalStyled>;

const shouldForwardProp = (prop: string) => !prop.startsWith("$");

export const styled = ((
  component: StylesParameters[0],
  config: StylesParameters[1],
) => {
  return originalStyled(component, { shouldForwardProp, ...config });
}) as typeof originalStyled;

const tags =
  "a|abbr|address|area|article|aside|audio|b|base|bdi|bdo|big|blockquote|body|br|button|canvas|caption|cite|code|col|colgroup|data|datalist|dd|del|details|dfn|dialog|div|dl|dt|em|embed|fieldset|figcaption|figure|footer|form|h1|h2|h3|h4|h5|h6|head|header|hgroup|hr|html|i|iframe|img|input|ins|kbd|keygen|label|legend|li|link|main|map|mark|marquee|menu|menuitem|meta|meter|nav|noscript|object|ol|optgroup|option|output|p|param|picture|pre|progress|q|rp|rt|ruby|s|samp|script|section|select|small|source|span|strong|style|sub|summary|sup|table|tbody|td|textarea|tfoot|th|thead|time|title|tr|track|u|ul|var|video|wbr|circle|clipPath|defs|ellipse|foreignObject|g|image|line|linearGradient|mask|path|pattern|polygon|polyline|radialGradient|rect|stop|svg|text|tspan".split(
    "|",
  );

for (const tag of tags) {
  (styled as any)[tag] = styled(tag as any);
}

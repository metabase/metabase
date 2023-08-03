import { Anchor, Box, Code, SimpleGrid, Text } from "@mantine/core";

export const Playground = () => {
  const sizes = [
    { size: "xl" },
    { size: "lg" },
    { size: "md" },
    { size: "sm" },
    { size: "sm", fw: 700 },
    { size: "xs" },
  ];
  const styles = [
    { color: "brand.1" },
    { td: "underline", color: "brand.1" },
    { td: "underline", color: "brand.1" },
    { td: "underline", color: "text.2" },
    { component: Text, strikethrough: true, color: "text.2" },
    { component: Text, color: "text.2" },
  ];

  const multiline =
    "Having small touches of colour makes it more colourful than having the whole thing in colour";
  const singleline = "Weniger";

  return (
    <Box p="5rem">
      <SimpleGrid cols={6}>
        {/*<div>multiline</div>*/}
        <div>link idle</div>
        <div>link hover</div>
        <div>link focused</div>
        <div>link pressed</div>
        <div>strikethrough</div>
        <div>Singleline</div>
        {sizes.map((size, index) => (
          <>
            {/*<Text key={index} {...size}>*/}
            {/*  {multiline}*/}
            {/*</Text>*/}
            {styles.map(({ component, ...style }, index) => {
              const Component = component || Anchor;
              const props = component ?? { href: `/playground#${index}` };
              return (
                <div key={index}>
                  <Component {...props} {...size} {...style}>
                    {singleline}
                  </Component>
                </div>
              );
            })}
          </>
        ))}
        {/*{styles.map((style, index) => (*/}
        {/*  <Anchor key={index} {...style}>*/}
        {/*    {singleline}*/}
        {/*  </Anchor>*/}
        {/*))}*/}
      </SimpleGrid>

      <div>
        <>
          {multiline.slice(0, 10)}

          <Code>
            <Anchor href={`/playground#${420 * 69}`}>testing</Anchor>
          </Code>

          <Anchor href={`/playground#${420 * 69}`}>
            <Code>testing</Code>
          </Anchor>

          {multiline.slice(10, 20)}
        </>
      </div>
    </Box>
  );
};

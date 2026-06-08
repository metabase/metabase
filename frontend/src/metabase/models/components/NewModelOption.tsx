import { Link, type LinkProps } from "react-router";

import { Box, Flex, Text, Title } from "metabase/ui";

import S from "./NewModelOption.module.css";

const DEFAULT_IMAGE_WIDTH = 210;

type NewModelOptionProps = LinkProps & {
  image: string;
  title: string;
  description: string;
  width?: number;
};

export function NewModelOption({
  width = DEFAULT_IMAGE_WIDTH,
  image,
  title,
  description,
  ...props
}: NewModelOptionProps) {
  return (
    <Link {...props} className={S.linkWrapper}>
      <Flex align="center" justify="center" h="10rem">
        <img src={`${image}.png`} srcSet={`${image}@2x.png 2x`} width={width} />
      </Flex>
      <Box my="md">
        <Title order={2} className={S.modelTitle}>
          {title}
        </Title>
        <Text c="text-secondary" maw="22.5rem" mt="sm">
          {description}
        </Text>
      </Box>
    </Link>
  );
}

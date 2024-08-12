import { Link } from "react-router";

import { Stack, Title, Text, Paper } from "metabase/ui";

import NewModelOptionS from "./NewModelOption.module.css";

type NewModelOptionProps = {
  to: string;
  image: string;
  title: string;
  description: string;
};

export const NewModelOption = ({
  to,
  image,
  title,
  description,
}: NewModelOptionProps) => (
  <Link to={to}>
    <Paper
      className={NewModelOptionS.NewModelOptionContainer}
      withBorder
      p="2rem"
      h={340}
    >
      <Stack justify="center" align="center" h="100%" px="2rem">
        <img
          src={`${image}.png`}
          style={{ width: "180px" }}
          srcSet={`${image}@2x.png 2x`}
        />
        <Title className={NewModelOptionS.Title}>{title}</Title>
        <Text inline align="center" color="text-medium">
          {description}
        </Text>
      </Stack>
    </Paper>
  </Link>
);

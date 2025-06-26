import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, type IconName, Title } from "metabase/ui";

const sizeOptions = {
  md: {
    height: "2.5rem",
    flexDirection: "row",
    alignItems: "center",
    gap: "0.5rem",
    iconSize: 16,
  },
  lg: {
    height: "8.5rem",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "2.5rem",
    iconSize: 32,
  },
};

export const BrowseCard = ({
  icon,
  to,
  iconColor = "brand",
  title,
  size = "md",
  children,
  onClick,
}: {
  icon: IconName;
  to: string;
  iconColor?: string;
  title: string;
  size?: "md" | "lg";
  children?: React.ReactNode;
  onClick?: () => void;
}) => {
  return (
    <Box
      component={Link}
      to={to}
      onClick={onClick}
      bd="1px solid var(--mb-color-border)"
      bg="white"
      h={sizeOptions[size].height}
      p="1.5rem"
      style={{
        borderRadius: "var(--mantine-radius-md)",
      }}
      className={CS.textBrandHover}
    >
      <Flex justify="space-between" h="100%" align="center">
        <Flex
          direction={sizeOptions[size].flexDirection}
          align={sizeOptions[size].alignItems}
          gap={sizeOptions[size].gap}
          h="100%"
        >
          <Icon name={icon} c={iconColor} size={sizeOptions[size].iconSize} />
          <Title order={2} size="md" lh={1.2} c="inherit">
            {title}
          </Title>
        </Flex>
        {children && <Box>{children}</Box>}
      </Flex>
    </Box>
  );
};

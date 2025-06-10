import { useMemo } from "react";
import { useLocation } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import LogoIcon from "metabase/components/LogoIcon";
import { Box, Center, Flex, Icon, type IconName, Text } from "metabase/ui";

import { LanguageSelector } from "../LanguageSelector";

const ICON_SIZE = 30;
const STEP_GAP = 22;

interface StepType {
  key: string;
  title: string;
  slugs: string[];
  icon: IconName;
}

export const EmbeddingSetupSidebar = () => {
  const pathname = useLocation().pathname?.split("/").at(-1);

  const steps = useMemo<StepType[]>(() => {
    return [
      {
        key: "connect_data",
        title: t`Connect to your data`,
        slugs: ["data-connection"],
        icon: "database",
      },
      {
        key: "generate_starter_content",
        title: t`Generate starter content`,
        slugs: ["table-selection", "processing"],
        icon: "bolt",
      },
      {
        key: "add_to_app",
        title: t`Add to your app`,
        slugs: ["final"],
        icon: "snippet",
      },
    ];
  }, []);

  const currentStepIndex = useMemo(() => {
    if (pathname === "done") {
      return steps.length;
    }
    return steps.findIndex((step) => step.slugs.includes(pathname ?? ""));
  }, [steps, pathname]);

  return (
    <Box
      aria-label="Embedding Setup Sidebar"
      w="250px"
      pt="xl"
      p="md"
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {t`Show more options`}
      <Flex mb="xl" direction="column" align="center">
        <Box h={39} w={39} mb="md">
          <LogoIcon />
        </Box>
        <Text fw="bold" size="2xl" mb="xl">
          {t`Embedded Analytics`}
        </Text>
      </Flex>
      <Box role="list" style={{ position: "relative" }}>
        {steps.map((step, index) => (
          <Step
            key={step.key}
            icon={step.icon}
            title={step.title}
            isLast={index === steps.length - 1}
            status={match(index)
              .when(
                (i) => i < currentStepIndex,
                () => "done" as const,
              )
              .when(
                (i) => i === currentStepIndex,
                () => "active" as const,
              )
              .otherwise(() => "future" as const)}
          />
        ))}
      </Box>
      <Center mt="auto" pt="xl" mb="xxl">
        <LanguageSelector />
      </Center>
    </Box>
  );
};

interface StepProps {
  title: string;
  status: "done" | "active" | "future";
  isLast: boolean;
  icon: IconName;
}

const Step = ({ title, status, isLast, icon }: StepProps) => {
  const { iconName, iconCssColor, circleBgCssColor, circleBorderCss } = match(
    status,
  )
    .with(
      "done",
      () =>
        ({
          iconName: "check",
          iconCssColor: "var(--mb-color-text-white)",
          circleBgCssColor: "#5CA040",
          circleBorderCss: "none",
        }) as const,
    )
    .with(
      "active",
      () =>
        ({
          iconName: icon,
          iconCssColor: "var(--mb-color-brand)",
          circleBgCssColor: "#fff",
          circleBorderCss: "2px solid var(--mb-color-brand)",
        }) as const,
    )
    .otherwise(
      () =>
        ({
          iconName: icon,
          iconCssColor: "var(--mb-color-text-light)",
          circleBgCssColor: "#fff",
          circleBorderCss: "2px solid var(--mb-color-border)",
        }) as const,
    );

  return (
    <Flex
      style={{
        gap: 12,
        alignItems: "center",
        position: "relative",
        minHeight: ICON_SIZE,
        marginBottom: isLast ? 0 : STEP_GAP,
      }}
    >
      <Box
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          height: ICON_SIZE,
        }}
      >
        {/* Vertical line */}
        {!isLast && (
          <Box
            style={{
              position: "absolute",
              top: ICON_SIZE / 2,
              left: "50%",
              width: 1,
              height: `calc(100% + ${STEP_GAP - ICON_SIZE / 2}px)`,
              background: "var(--mb-color-border)",
              transform: "translateX(-50%)",
              zIndex: 0,
            }}
          />
        )}
        {/* Icon circle */}
        <Box
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            borderRadius: "50%",
            background: circleBgCssColor,
            border: circleBorderCss,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
          }}
        >
          <Icon name={iconName} color={iconCssColor} size={16} />
        </Box>
      </Box>
      <Text c="text-primary" size="md">
        {title}
      </Text>
    </Flex>
  );
};

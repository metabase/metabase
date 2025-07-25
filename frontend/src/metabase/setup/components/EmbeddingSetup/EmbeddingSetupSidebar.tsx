import { match } from "ts-pattern";
import { t } from "ttag";

import LogoIcon from "metabase/common/components/LogoIcon";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Box, Center, Flex, Icon, type IconName, Text } from "metabase/ui";

import { LanguageSelector } from "../LanguageSelector";

import { useEmbeddingSetup } from "./EmbeddingSetupContext";
import type { StepDefinition } from "./steps/embeddingSetupSteps";

const ICON_SIZE = 30;
const STEP_GAP = 22;

export const EmbeddingSetupSidebar = () => {
  const { stepKey, steps, stepIndex: currentStepIndex } = useEmbeddingSetup();

  const visibleSteps = steps.filter((step) => step.visibleInSidebar);
  const currentStepIndexInVisibleSteps = visibleSteps.findIndex(
    (step) => step.key === stepKey,
  );

  return (
    <Box
      component="aside"
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
      <Flex mb="xl" direction="column" align="center">
        <Box h={39} w={39} mb="md">
          <LogoIcon />
        </Box>
        <Text fw="bold" size="2xl" mb="xl">
          {t`Embedded Analytics`}
        </Text>
      </Flex>
      <Box component="ol" style={{ position: "relative" }}>
        {steps.map((step: StepDefinition, index: number) => {
          if (!step.visibleInSidebar) {
            return null;
          }
          const indexInVisibleSteps = visibleSteps.findIndex(
            (visibleStep) => visibleStep.key === step.key,
          );

          const status = match({ index, indexInVisibleSteps })
            .when(
              ({ indexInVisibleSteps }) =>
                indexInVisibleSteps === currentStepIndexInVisibleSteps,
              () => "active" as const,
            )
            .when(
              ({ index }) => index < currentStepIndex,
              () => "done" as const,
            )
            .otherwise(() => "future" as const);

          return (
            <Step
              key={step.key}
              icon={step.icon}
              title={step.title}
              isLast={indexInVisibleSteps === visibleSteps.length - 1}
              status={status}
            />
          );
        })}
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
  const uniqueId = useUniqueId("step-label");
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
    .with(
      "future",
      () =>
        ({
          iconName: icon,
          iconCssColor: "var(--mb-color-text-light)",
          circleBgCssColor: "#fff",
          circleBorderCss: "2px solid var(--mb-color-border)",
        }) as const,
    )
    .exhaustive();

  return (
    <Flex
      component="li"
      aria-labelledby={uniqueId}
      aria-current={status === "active" ? "step" : undefined}
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
      <Text c="text-primary" size="md" id={uniqueId}>
        {title}
      </Text>
    </Flex>
  );
};

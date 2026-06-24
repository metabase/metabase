import { useId } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  CopyButton,
  Flex,
  Icon,
  Input,
  PasswordInput,
  Tooltip,
} from "metabase/ui";

interface PasswordRevealProps {
  password: string;
}

export const PasswordReveal = ({ password }: PasswordRevealProps) => {
  const inputId = useId();

  return (
    <Input.Wrapper
      label={t`Temporary password`}
      labelProps={{ htmlFor: inputId }}
    >
      <Flex gap="md" align="center" wrap="nowrap">
        <PasswordInput
          id={inputId}
          value={password}
          readOnly
          radius="lg"
          size="lg"
          flex={1}
        />
        <CopyButton value={password} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? t`Copied!` : t`Copy`}>
              <ActionIcon
                onClick={copy}
                data-testid="copy-button"
                aria-label={t`Copy password`}
                variant="subtle"
                color="icon-secondary"
                size="lg"
              >
                <Icon name={copied ? "check" : "copy"} />
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Flex>
    </Input.Wrapper>
  );
};

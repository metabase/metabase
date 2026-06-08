import cx from "classnames";
import { type ComponentProps, useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import type { PublicLinkPasswordSectionProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
  Group,
  Icon,
  TextInput as MantineTextInput,
  Switch,
  Text,
} from "metabase/ui";

import S from "./PublicLinkPasswordSection.module.css";
import {
  useDeletePublicLinkPasswordMutation,
  useGetPublicLinkPasswordQuery,
  useSetPublicLinkPasswordMutation,
} from "./api";

const MIN_PASSWORD_LENGTH = 6;

type PasswordState = "idle" | "setting" | "viewing" | "editing";

function getValidationError(value: string): string | undefined {
  if (value.length > 0 && value.length < MIN_PASSWORD_LENGTH) {
    return t`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

export const PublicLinkPasswordSection = ({
  entityType,
  entityId,
  onRemoveLink,
}: PublicLinkPasswordSectionProps) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const {
    data: passwordData,
    isLoading,
    error: fetchError,
  } = useGetPublicLinkPasswordQuery(
    { entityType, entityId },
    { refetchOnMountOrArgChange: true },
  );

  const [setPassword] = useSetPublicLinkPasswordMutation();
  const [deletePassword] = useDeletePublicLinkPasswordMutation();

  const is404 = (fetchError as any)?.status === 404;
  const hasPassword = !!passwordData?.password && !fetchError;
  const currentPassword = passwordData?.password ?? "";

  const [state, setState] = useState<PasswordState>("idle");
  const [inputValue, setInputValue] = useState("");

  const isEditable = state === "setting" || state === "editing";
  const validationError = isEditable
    ? getValidationError(inputValue)
    : undefined;
  const canSave =
    inputValue.length >= MIN_PASSWORD_LENGTH &&
    (state !== "editing" || inputValue !== currentPassword);

  useEffect(() => {
    if (!isLoading) {
      setState(hasPassword ? "viewing" : "idle");
    }
  }, [hasPassword, isLoading]);

  const handleToggle = useCallback(async () => {
    if (hasPassword) {
      await deletePassword({ entityType, entityId });
      setState("idle");
      setInputValue("");
    } else if (state === "setting") {
      setState("idle");
      setInputValue("");
    } else {
      setState("setting");
      setInputValue("");
    }
  }, [hasPassword, state, deletePassword, entityType, entityId]);

  const handleSave = useCallback(async () => {
    if (inputValue.length < MIN_PASSWORD_LENGTH) {
      return;
    }
    await setPassword({ entityType, entityId, password: inputValue });
    setState("viewing");
  }, [inputValue, setPassword, entityType, entityId]);

  const handleEdit = useCallback(() => {
    setState("editing");
    setInputValue(currentPassword);
  }, [currentPassword]);

  const handleCancelEdit = useCallback(() => {
    setState("viewing");
    setInputValue("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (inputValue.length < MIN_PASSWORD_LENGTH) {
      return;
    }
    await setPassword({ entityType, entityId, password: inputValue });
    setState("viewing");
  }, [inputValue, setPassword, entityType, entityId]);

  if (isLoading || (fetchError && !is404)) {
    return null;
  }

  const toggleOn = hasPassword || state === "setting";

  return (
    <Box mt="md">
      <Group justify="space-between" align="center">
        {isAdmin && (
          <Group gap="xs" align="center">
            <Text size="sm">{t`Require password`}</Text>
            <Switch
              size="xs"
              checked={toggleOn}
              onChange={handleToggle}
              data-testid="public-link-password-toggle"
            />
          </Group>
        )}
        {onRemoveLink && (
          <Text
            size="sm"
            fw={700}
            c="error"
            style={{ cursor: "pointer" }}
            onClick={onRemoveLink}
          >{t`Remove public link`}</Text>
        )}
      </Group>

      {(state === "setting" || state === "viewing" || state === "editing") && (
        <Box mt={isAdmin ? "md" : undefined}>
          <Text size="md" fw={700} lh="1rem" mb="xs">{t`Password`}</Text>

          {state === "setting" && isAdmin && (
            <TextInput
              placeholder={t`Enter a password`}
              value={inputValue}
              onChange={(e) => setInputValue(e.currentTarget.value)}
              error={validationError}
              data-testid="public-link-password-input"
              iconBoxWidth={50}
              rightSection={
                <Text
                  size="sm"
                  fw={700}
                  c={canSave ? "brand" : "text-tertiary"}
                  style={{
                    cursor: canSave ? "pointer" : "default",
                  }}
                  onClick={canSave ? handleSave : undefined}
                  data-testid="public-link-password-save"
                >{t`Save`}</Text>
              }
            />
          )}

          {state === "viewing" && (
            <TextInput
              value={currentPassword}
              readOnly
              data-testid="public-link-password-display"
              iconBoxWidth={isAdmin ? 70 : 36}
              rightSection={
                <Group gap={12} wrap="nowrap">
                  {isAdmin && (
                    <IconButton
                      icon="pencil"
                      onClick={handleEdit}
                      aria-label={t`Edit password`}
                      data-testid="public-link-password-edit"
                    />
                  )}
                  <CopyButton value={currentPassword} />
                </Group>
              }
            />
          )}

          {state === "editing" && isAdmin && (
            <TextInput
              value={inputValue}
              onChange={(e) => setInputValue(e.currentTarget.value)}
              error={validationError}
              data-testid="public-link-password-input"
              iconBoxWidth={70}
              rightSection={
                <Group gap={12} wrap="nowrap">
                  <IconButton
                    icon="close"
                    variant="error"
                    onClick={handleCancelEdit}
                    aria-label={t`Cancel`}
                    data-testid="public-link-password-cancel"
                  />
                  <IconButton
                    icon="check"
                    variant="success"
                    disabled={!canSave}
                    onClick={handleSaveEdit}
                    aria-label={t`Save`}
                    data-testid="public-link-password-confirm"
                  />
                </Group>
              }
            />
          )}
        </Box>
      )}
    </Box>
  );
};

const IconButton = ({
  icon,
  variant = "brand",
  disabled,
  onClick,
  ...props
}: {
  icon: "pencil" | "close" | "check";
  variant?: "brand" | "error" | "success";
  disabled?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
  "data-testid"?: string;
}) => {
  const hoverClasses = {
    brand: S.iconButtonBrandHover,
    error: S.iconButtonErrorHover,
    success: S.iconButtonSuccessHover,
  };

  return (
    <div
      className={cx(
        S.iconButton,
        disabled ? S.iconButtonDisabled : hoverClasses[variant],
      )}
      onClick={disabled ? undefined : onClick}
      role="button"
      tabIndex={0}
      {...props}
    >
      <Icon name={icon} size={16} />
    </div>
  );
};

const TextInput = (
  props: ComponentProps<typeof MantineTextInput> & { iconBoxWidth?: number },
) => {
  const { iconBoxWidth, ...otherProps } = props;

  return (
    <MantineTextInput
      {...otherProps}
      styles={{
        input: {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          paddingInlineEnd: iconBoxWidth,
        },
        section: {
          width: "auto",
          paddingRight: "12px",
        },
      }}
    />
  );
};

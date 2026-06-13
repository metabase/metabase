import cx from "classnames";
import { type ComponentProps, useCallback, useState } from "react";
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
  useRevealPublicLinkPasswordMutation,
  useSetPublicLinkPasswordMutation,
} from "./api";

const MIN_PASSWORD_LENGTH = 6;

// Whether the user is actively setting a new password or editing an existing
// one. When `null`, the section is derived from the server state: `viewing` if
// a password exists, `idle` otherwise.
type PasswordMode = "setting" | "editing" | null;

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
  const [revealPassword] = useRevealPublicLinkPasswordMutation();

  const hasPassword = !!passwordData?.has_password && !fetchError;

  const [mode, setMode] = useState<PasswordMode>(null);
  const [inputValue, setInputValue] = useState("");
  // The plaintext secret, once revealed. `null` means hidden — the value is
  // never fetched on mount, only on an explicit (audited) reveal/edit.
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  const isEditing = mode === "setting" || mode === "editing";
  const isViewing = hasPassword && mode === null;
  const validationError = isEditing
    ? getValidationError(inputValue)
    : undefined;
  const canSave =
    inputValue.length >= MIN_PASSWORD_LENGTH &&
    (mode !== "editing" || inputValue !== revealedPassword);

  const resetDraft = useCallback(() => {
    setMode(null);
    setInputValue("");
  }, []);

  // Fetch the plaintext secret — the audited "reveal" action. Reuses the value
  // if it is already revealed in memory, so copying/editing an already-revealed
  // password does not re-trigger the audit event.
  const fetchPassword = useCallback(async () => {
    if (revealedPassword != null) {
      return revealedPassword;
    }
    const { password } = await revealPassword({
      entityType,
      entityId,
    }).unwrap();
    return password;
  }, [revealedPassword, revealPassword, entityType, entityId]);

  const handleReveal = useCallback(async () => {
    try {
      setRevealedPassword(await fetchPassword());
    } catch {
      // Stay masked if the reveal fails.
    }
  }, [fetchPassword]);

  const handleToggle = useCallback(async () => {
    if (hasPassword) {
      await deletePassword({ entityType, entityId });
      resetDraft();
      setRevealedPassword(null);
    } else {
      setMode(mode === "setting" ? null : "setting");
      setInputValue("");
    }
  }, [hasPassword, mode, deletePassword, entityType, entityId, resetDraft]);

  const handleSave = useCallback(async () => {
    if (!canSave) {
      return;
    }
    // Only leave the editing/setting state once the write succeeds — otherwise
    // we'd fall back to `viewing` and show the stale (or empty) server value as
    // if the new password had been saved.
    try {
      await setPassword({
        entityType,
        entityId,
        password: inputValue,
      }).unwrap();
      // The admin just typed this value, so show it revealed without a separate
      // audited reveal.
      setRevealedPassword(inputValue);
      resetDraft();
    } catch {
      // Keep the user in the input so they can retry.
    }
  }, [canSave, inputValue, setPassword, entityType, entityId, resetDraft]);

  const handleEdit = useCallback(async () => {
    try {
      // Editing needs the current secret to pre-fill and to detect changes —
      // this counts as a reveal.
      const password = await fetchPassword();
      setRevealedPassword(password);
      setInputValue(password);
      setMode("editing");
    } catch {
      // Leave the user in the viewing state if the reveal fails.
    }
  }, [fetchPassword]);

  if (isLoading || fetchError) {
    return null;
  }

  const toggleOn = hasPassword || mode === "setting";
  const isRevealed = revealedPassword != null;

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

      {(isEditing || isViewing) && (
        <Box mt={isAdmin ? "md" : undefined}>
          <Text size="md" fw={700} lh="1rem" mb="xs">{t`Password`}</Text>

          {mode === "setting" && isAdmin && (
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

          {isViewing && (
            <TextInput
              value={isRevealed ? revealedPassword : "••••••••"}
              readOnly
              data-testid="public-link-password-display"
              rightSection={
                <Group gap={12} wrap="nowrap">
                  <IconButton
                    icon={isRevealed ? "eye_crossed_out" : "eye"}
                    onClick={
                      isRevealed
                        ? () => setRevealedPassword(null)
                        : handleReveal
                    }
                    aria-label={
                      isRevealed ? t`Hide password` : t`Reveal password`
                    }
                    data-testid="public-link-password-reveal"
                  />
                  {isAdmin && (
                    <IconButton
                      icon="pencil"
                      onClick={handleEdit}
                      aria-label={t`Edit password`}
                      data-testid="public-link-password-edit"
                    />
                  )}
                  <CopyButton
                    value={fetchPassword}
                    className={cx(S.iconButton, S.iconButtonBrandHover)}
                    target={<Icon name="copy" size={16} />}
                    aria-label={t`Copy password`}
                    data-testid="public-link-password-copy"
                  />
                </Group>
              }
            />
          )}

          {mode === "editing" && isAdmin && (
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
                    onClick={resetDraft}
                    aria-label={t`Cancel`}
                    data-testid="public-link-password-cancel"
                  />
                  <IconButton
                    icon="check"
                    variant="success"
                    disabled={!canSave}
                    onClick={handleSave}
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
  icon: "pencil" | "close" | "check" | "eye" | "eye_crossed_out";
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

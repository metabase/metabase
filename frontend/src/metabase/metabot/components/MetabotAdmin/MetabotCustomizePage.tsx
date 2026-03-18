import { useRef, useState } from "react";
import { t } from "ttag";

import {
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import {
  Box,
  Button,
  Flex,
  Icon,
  Paper,
  Stack,
  TextInput,
} from "metabase/ui";

// --- Icon Upload ---

function IconUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <Box>
      <SettingHeader
        id="metabot-icon"
        title={t`Metabot's icon`}
        description={t`Upload a custom icon for Metabot. For best results, use an SVG or PNG with a transparent background.`}
      />
      <Paper
        p="md"
        withBorder
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--mb-radius-sm, 4px)",
            border: "1px solid var(--mb-color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            backgroundColor: "var(--mb-color-background-secondary)",
          }}
        >
          {value ? (
            <img
              src={value}
              alt="Metabot icon"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <Icon name="insight" size={20} />
          )}
        </Box>
        <Flex gap="sm">
          <Button
            variant="default"
            size="xs"
            onClick={() => fileInputRef.current?.click()}
          >
            {value ? t`Change` : t`Upload`}
          </Button>
          {value && (
            <Button
              variant="subtle"
              size="xs"
              c="text-secondary"
              onClick={() => onChange(null)}
            >
              {t`Reset to default`}
            </Button>
          )}
        </Flex>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/svg+xml,image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </Paper>
    </Box>
  );
}

export function MetabotCustomizePage() {
  const [name, setName] = useState("Metabot");
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);

  return (
    <Stack gap="xl" style={{ margin: 32 }}>
      <SettingsSection
        title={t`Identity`}
        description={t`Customize how Metabot appears to users.`}
      >
        <Stack gap="lg">
          <TextInput
            label={t`Metabot's name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            w={240}
            size="sm"
          />
          <IconUpload value={iconDataUrl} onChange={setIconDataUrl} />
        </Stack>
      </SettingsSection>
    </Stack>
  );
}

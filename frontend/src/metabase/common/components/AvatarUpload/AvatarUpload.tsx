import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Icon, Text } from "metabase/ui";

const MB = 1024 * 1024;
const IMAGE_SIZE_LIMIT = 2 * MB;
const MAX_DIMENSIONS = 1200;

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onUpload: (dataUri: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export function AvatarUpload({
  currentAvatarUrl,
  onUpload,
  onRemove,
  disabled = false,
  size = "md",
}: AvatarUploadProps) {
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeMap = {
    sm: { preview: 60, button: "sm" },
    md: { preview: 80, button: "md" },
    lg: { preview: 120, button: "lg" },
  };

  const { preview: previewSize, button: buttonSize } = sizeMap[size];

  function handleFileUpload(fileEvent: ChangeEvent<HTMLInputElement>) {
    setErrorMessage("");
    if (fileEvent.target.files && fileEvent.target.files.length > 0) {
      const file = fileEvent.target.files[0];

      // Validate file type
      if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/)) {
        setErrorMessage(t`Please choose a JPG, PNG, or WebP image file.`);
        return;
      }

      // Validate file size
      if (file.size > IMAGE_SIZE_LIMIT) {
        setErrorMessage(
          t`The image you chose is larger than 2MB. Please choose another one.`,
        );
        return;
      }

      setIsUploading(true);
      const reader = new FileReader();
      reader.onload = async (readerEvent) => {
        const dataUri = readerEvent.target?.result as string;

        // Validate image dimensions
        if (!(await validateImageDimensions(dataUri))) {
          setErrorMessage(
            t`The image dimensions must be 1200x1200 pixels or smaller.`,
          );
          setIsUploading(false);
          return;
        }

        // Validate image integrity
        if (!(await isFileIntact(dataUri))) {
          setErrorMessage(
            t`The image you chose is corrupted. Please choose another one.`,
          );
          setIsUploading(false);
          return;
        }

        setErrorMessage("");
        setFileName(file.name);
        onUpload(dataUri);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleRemove() {
    setErrorMessage("");
    if (fileInputRef.current?.value) {
      fileInputRef.current.value = "";
    }
    setFileName("");
    onRemove();
  }

  return (
    <Box>
      {errorMessage && (
        <Text size="sm" c="error" mb="sm">
          {errorMessage}
        </Text>
      )}

      <Flex align="center" gap="md">
        {/* Avatar Preview */}
        <Box
          w={previewSize}
          h={previewSize}
          style={{
            borderRadius: "50%",
            overflow: "hidden",
            border: "2px solid var(--mb-color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--mb-color-bg-light)",
          }}
        >
          {currentAvatarUrl ? (
            <img
              src={currentAvatarUrl}
              alt={t`Profile avatar`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <Icon name="person" size={previewSize * 0.4} c="text-light" />
          )}
        </Box>

        {/* Upload Controls */}
        <Flex direction="column" gap="xs">
          <Button
            size={buttonSize}
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            loading={isUploading}
          >
            {currentAvatarUrl ? t`Change Avatar` : t`Upload Avatar`}
          </Button>

          {currentAvatarUrl && (
            <Button
              size="xs"
              variant="subtle"
              c="text-medium"
              onClick={handleRemove}
              disabled={disabled || isUploading}
              leftSection={<Icon name="close" size={12} />}
            >
              {t`Remove`}
            </Button>
          )}

          <input
            ref={fileInputRef}
            hidden
            onChange={handleFileUpload}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            multiple={false}
            data-testid="avatar-file-input"
          />
        </Flex>
      </Flex>

      {fileName && (
        <Text size="xs" c="text-medium" mt="xs">
          {t`Selected: ${fileName}`}
        </Text>
      )}
    </Box>
  );
}

async function validateImageDimensions(dataUri: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = document.createElement("img");
    image.src = dataUri;
    image.onload = () => {
      const isValid =
        image.width <= MAX_DIMENSIONS && image.height <= MAX_DIMENSIONS;
      resolve(isValid);
    };
    image.onerror = () => resolve(false);
  });
}

async function isFileIntact(dataUri: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = document.createElement("img");
    image.src = dataUri;
    image.onerror = () => resolve(false);
    image.onload = () => resolve(true);
  });
}

import { Button, Box, Flex, Text, Icon, Modal } from "metabase/ui"; // Import necessary UI components
import { useState } from "react";
import {
  formatAndCleanCubeContent,
} from "metabase/components/Cube/utils";
import { t } from "ttag";

interface SingleCubeProps {
  cube: any;
  isExpanded: boolean;
  onExpand?: () => void;
  onUpdate?: (updatedCube: any, originalCube: any) => void;
  handleSemanticView: () => void;
}

export const SingleCube: React.FC<SingleCubeProps> = ({
  cube,
  isExpanded,
  onExpand,
  onUpdate,
  handleSemanticView,
}) => {
  const [isEditing, setIsEditing] = useState(true);
  const [originalCubeContent, setOriginalCubeContent] = useState(cube.content);
  const [editedContent, setEditedContent] = useState(
    formatAndCleanCubeContent(cube.content),
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsModalOpen(true); // Open the confirmation modal
  };

  const handleConfirmSave = () => {
    try {
      const updatedCube = editedContent;
      if (onUpdate) onUpdate(updatedCube, originalCubeContent);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving cube:", error);
    }
    setIsModalOpen(false); // Close the modal after saving
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleCancel = () => {
    setEditedContent(formatAndCleanCubeContent(cube.content));
    handleSemanticView();
  };

  return (
    <div>
      {/* Header with Title and Buttons */}
      <Flex
        justify="space-between"
        align="center"
        style={{ padding: "20px 10px" }}
      >
        {/* Title */}
        <Text size="lg" weight="bold">
          {t`>_ Edit OmniAI layer code`}
        </Text>

        {/* Save and Back Buttons */}
        <Flex gap="lg">
          <Icon size={20} name="description" style={{ cursor: "pointer" }} />
          <Icon
            size={20}
            name="menu_book"
            style={{ cursor: "pointer" }}
            onClick={handleCancel}
          />
          <Text
            onClick={handleSave}
            style={{
              textTransform: "none",
              fontWeight: "600",
              fontSize: "18px",
              lineHeight: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
            }}
          >
            {t`Save`}
          </Text>
        </Flex>
      </Flex>

      {/* Cube Editing Content */}
      {isExpanded && (
        <div>
          <div>
            {isEditing ? (
              <>
                <textarea
                  style={{
                    width: "80vw",
                    height: "80vh",
                    backgroundColor: "#F7F8F6",
                    border: "none",
                    padding: "12px",
                    resize: "none",
                  }}
                  value={editedContent}
                  onChange={e => setEditedContent(e.target.value)}
                />
              </>
            ) : (
              <pre>{formatAndCleanCubeContent(cube.content)}</pre>
            )}
          </div>
        </div>
      )}

      <Modal
        title={t`Are you sure you want to save?`}
        opened={isModalOpen}
        onClose={handleCloseModal}
        data-testid="save-confirmation-modal"
        trapFocus={true}
        withCloseButton={true}
      >
        <Flex direction="column" gap="md">
          <Box
            style={{
              display: "flex",
              flexDirection: "row",
              width: "100%",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            <Button
              variant="outlined"
              onClick={handleCloseModal}
              style={{
                fontWeight: "400",
                border: "1px solid #587330",
                color: "#587330",
                backgroundColor: "#FFF",
                borderRadius: "4px",
                width: "100%",
              }}
            >
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              onClick={handleConfirmSave}
              style={{
                fontWeight: "400",
                border: "1px solid #223800",
                color: "#FFF",
                backgroundColor: "#223800",
                borderRadius: "4px",
                width: "100%",
              }}
            >
              {t`Save`}
            </Button>
          </Box>
        </Flex>
      </Modal>
    </div>
  );
};

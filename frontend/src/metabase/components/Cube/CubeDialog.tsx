import { t } from "ttag";
import { Modal, Flex, Text, Input, Textarea, Box, Button } from "metabase/ui";
import { ENTITY_PICKER_Z_INDEX } from "metabase/common/components/EntityPicker";
import { CubeResult } from "metabase/browse/components/CubeTable";
import AceEditor from "react-ace";
import { color } from "metabase/lib/colors";
import { useState } from "react"; // Import useState for modal control

interface CubeInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cube: CubeResult;
  isValidationTable: boolean;
  handleSemanticView: () => void;
  onUpdateCube: (updatedCube: CubeResult) => void;
}

export const CubeDialog = ({
  isOpen,
  onClose,
  cube,
  isValidationTable,
  handleSemanticView,
  onUpdateCube,
}: CubeInfoDialogProps) => {
  console.log("🚀 ~ cube:", cube);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false); // State to control verify modal

  const handleVerify = () => {
    setIsVerifyModalOpen(true); // Open the verification modal
  };

  const handleConfirmVerify = () => {
    const updatedCube = { ...cube, verified_status: true }; // Update the verifiedStatus
    onUpdateCube(updatedCube); // Call the provided callback to update the cube
    setIsVerifyModalOpen(false); // Close the modal after confirming
    onClose(); // Close the main modal
  };

  const handleCloseVerifyModal = () => {
    setIsVerifyModalOpen(false); // Close the verify modal without making changes
  };

  const isLongDescription = cube.description.length >= 62;

  return (
    <>
      {/* Main Cube Info Modal */}
      <Modal
        title={
          isValidationTable
            ? `${t`Send new definition request to admin`}`
            : `${t`Definition Details`}`
        }
        opened={isOpen}
        onClose={onClose}
        data-testid="cube-info-dialog"
        trapFocus={true}
        withCloseButton={true}
        zIndex={ENTITY_PICKER_Z_INDEX}
        className="width: 500px"
        size={"lg"}
      >
        <Flex direction="column" gap="md">
          <Flex direction="column">
            <Text weight="bold">
              {" "}
              {isValidationTable ? `${t`Question`}` : `${t`Name`}`}
            </Text>
            <Input value={cube.name} readOnly></Input>
          </Flex>
          {!isValidationTable && (
            <Flex direction="column">
              <Flex direction="row" justify="space-between">
                <Flex direction="column">
                  <Text weight="bold">{t`Key`}</Text>
                  <Text>
                    {cube.primaryKey ? "Unique Key" : "Non-Unique Key"}
                  </Text>
                </Flex>
                <Flex direction="column">
                  <Text weight="bold">{t`Category`}</Text>
                  <Text style={{ whiteSpace: "pre-wrap" }}>
                    {cube.category}
                  </Text>
                </Flex>
                <Flex direction="column">
                  <Text weight="bold">{t`Type`}</Text>
                  <Text>{cube.type}</Text>
                </Flex>
              </Flex>
            </Flex>
          )}
          <Flex direction="column">
            <Text weight="bold">{t`Description`}</Text>
            {!isLongDescription ? (
              <Input value={cube.description} readOnly></Input>
            ) : (
              <Textarea value={cube.description} readOnly></Textarea>
            )}
          </Flex>
          <Flex direction="column">
            <Text weight="bold">
              {isValidationTable
                ? `${t`Semantic layer suggested code update:`}`
                : `${t`SQL`}`}
            </Text>
            <AceEditor
              value={cube.sql}
              readOnly
              height="300px"
              highlightActiveLine={false}
              navigateToFileEnd={false}
              width="100%"
              fontSize={12}
              style={{ backgroundColor: color("bg-light") }}
              showPrintMargin={false}
              setOptions={{
                highlightGutterLine: false,
              }}
            />
          </Flex>
          {isValidationTable && (
            <>
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
                  onClick={onClose}
                  style={{
                    fontWeight: "400",
                    border: "1px solid #587330",
                    color: "#587330",
                    backgroundColor: "#FFF",
                    borderRadius: "4px",
                    width: "100%",
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  onClick={handleSemanticView}
                  style={{
                    fontWeight: "400",
                    border: "1px solid #223800",
                    color: "#FFF",
                    backgroundColor: "#223800",
                    borderRadius: "4px",
                    width: "100%",
                  }}
                >
                  Take me to OmniAI layer
                </Button>
              </Box>
              {cube.verified_status === false && (
                <Button
                  variant="filled"
                  onClick={handleVerify} // Opens the new modal
                  style={{
                    fontWeight: "400",
                    border: "1px solid #223800",
                    color: "#FFF",
                    backgroundColor: "#223800",
                    borderRadius: "4px",
                    width: "100%",
                  }}
                >
                  Verify
                </Button>
              )}
            </>
          )}
        </Flex>
      </Modal>

      {/* Verification Confirmation Modal */}
      <Modal
        title={t`Validate question as done?`}
        opened={isVerifyModalOpen}
        onClose={handleCloseVerifyModal}
        data-testid="verify-confirmation-modal"
        trapFocus={true}
        withCloseButton={true}
        zIndex={ENTITY_PICKER_Z_INDEX}
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
              onClick={handleCloseVerifyModal}
              style={{
                fontWeight: "400",
                border: "1px solid #587330",
                color: "#587330",
                backgroundColor: "#FFF",
                borderRadius: "4px",
                width: "100%",
              }}
            >
              {t`No, is still wrong`}
            </Button>
            <Button
              variant="filled"
              onClick={handleConfirmVerify} // Confirm verification
              style={{
                fontWeight: "400",
                border: "1px solid #223800",
                color: "#FFF",
                backgroundColor: "#223800",
                borderRadius: "4px",
                width: "100%",
              }}
            >
              {t`Yes`}
            </Button>
          </Box>
        </Flex>
      </Modal>
    </>
  );
};

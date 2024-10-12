import { t } from "ttag";
import { Button, Flex, Group, Title } from "metabase/ui";
import { useState } from "react"; // For managing the modal's open/close state
import { CubeConnection } from "metabase/components/Cube/CubeConnection";
import { BrowseHeader, BrowseSection } from "./BrowseContainer.styled";

export const BrowseSemanticHeader = ({ onSaveData }: { onSaveData: (data: any) => void }) => {
  const [isCubeModalOpen, setIsCubeModalOpen] = useState(false);

  // Handlers for opening/closing the modal
  const openCubeModal = () => setIsCubeModalOpen(true);
  const closeCubeModal = () => setIsCubeModalOpen(false);

  // Handle saving data from the modal and pass it to the parent component
  const handleSave = (data: any) => {
    onSaveData(data); // Pass the data up to the BrowseSemanticLayers
    closeCubeModal(); // Close the modal after saving
  };

  return (
    <>
      <BrowseHeader>
        <BrowseSection>
          <Flex
            w="100%"
            h="2.25rem"
            direction="row"
            justify="space-between"
            align="center"
          >
            <Title order={1} color="text-dark">
              <Group spacing="sm">
                {t`Semantic Layer`}
              </Group>
            </Title>

            {/* Button to open the modal */}
            <Flex align="center">
              <Button
                style={{
                  width: "150px",
                  height: "40px",
                  marginLeft: "30px",
                  background: "rgba(80, 158, 227, 0.2)",
                  color: "#587330",
                }}
                onClick={openCubeModal} // Opens the modal
              >
                {t`Cube configuration`}
              </Button>
            </Flex>
          </Flex>
        </BrowseSection>
      </BrowseHeader>

      {/* CubeConnection modal */}
      <CubeConnection
        isOpen={isCubeModalOpen}
        onClose={closeCubeModal}
        onSave={handleSave} // Pass the handleSave function to the modal
      />
    </>
  );
};

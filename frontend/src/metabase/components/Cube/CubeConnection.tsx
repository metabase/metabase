import { useState } from "react";
import { Modal, Flex, Text, Input, Box, Button } from "metabase/ui";
import { t } from "ttag";
import { useRegisterCubeDataMutation } from "metabase/api"; // Import the register mutation

interface CubeConnectionProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void; // Add an onSave prop for passing the saved data to the parent
}

export const CubeConnection = ({ isOpen, onClose, onSave }: CubeConnectionProps) => {
  // Define state for each field of the object and validation errors
  const [formData, setFormData] = useState<any>({
    projectName: "",
    dockerfile: "",
    dockerContextPath: "",
    customGitUrl: "",
    customGitBranch: "",
    customGitBuildPath: "",
    apiUrl: "",
    token: "",
    apiPort: "",
  });

  const [errors, setErrors] = useState({
    customGitUrl: "",
    apiUrl: "",
    projectName: "",
    token: "",
    apiPort: "",
  });

  const [registerCubeData] = useRegisterCubeDataMutation(); // Initialize the mutation hook

  // Function to validate URLs
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch (_) {
      return false;
    }
  };

  // Function to validate GitHub URL
  const isValidGitHubUrl = (url: string) => {
    const githubRegex = /^https:\/\/github\.com\/.+\/.+$/;
    return githubRegex.test(url);
  };

  // Handle input changes and reset the error for that field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    setErrors({
      ...errors,
      [name]: "", // Clear error when user starts typing
    });
  };

  // Validation check and handle save
  const handleSave = async () => {
    const newErrors = {
      projectName: formData.projectName ? "" : t`Project name is required`,
      customGitUrl: isValidGitHubUrl(formData.customGitUrl)
        ? ""
        : t`Please enter a valid GitHub URL`,
      apiUrl: isValidUrl(formData.apiUrl) ? "" : t`Please enter a valid URL`,
      token: formData.token ? "" : t`Token is required`,
      apiPort: formData.apiPort && !isNaN(Number(formData.apiPort))
        ? ""
        : t`Please enter a valid port number`,
    };

    setErrors(newErrors);

    const hasErrors = Object.values(newErrors).some((error) => error !== "");
    if (!hasErrors) {
      try {
        // Make the register API call with form data
        const registeredData = await registerCubeData(formData).unwrap(); // Unwrap handles promise rejection
        console.log("Cube registered successfully", registeredData);
        
        // Pass the saved data to the parent component through the onSave prop
        onSave(registeredData);

        onClose(); // Close modal after successful registration
      } catch (error) {
        console.error("Failed to register cube:", error);
      }
    }
  };

  return (
    <>
      <Modal
        title={t`Cube Connection Settings`}
        opened={isOpen}
        onClose={onClose}
        size="lg"
        data-testid="cube-connection-modal"
        trapFocus={true}
        withCloseButton={true}
      >
        <Flex direction="column" gap="md">
          {/* Project Name */}
          <Flex direction="column">
            <Text weight="bold">{t`Project Name`}</Text>
            <Input
              name="projectName"
              value={formData.projectName}
              onChange={handleInputChange}
              error={!!errors.projectName}
              placeholder={t`Enter the project name`}
            />
            {errors.projectName && (
              <Text color="red">{errors.projectName}</Text>
            )}
          </Flex>

          {/* Dockerfile */}
          <Flex direction="column">
            <Text weight="bold">{t`Dockerfile`}</Text>
            <Input
              name="dockerfile"
              value={formData.dockerfile}
              onChange={handleInputChange}
              placeholder={t`/Dockerfile`}
            />
          </Flex>

          {/* Docker Context Path */}
          <Flex direction="column">
            <Text weight="bold">{t`Docker Context Path`}</Text>
            <Input
              name="dockerContextPath"
              value={formData.dockerContextPath}
              onChange={handleInputChange}
              placeholder={t`/`}
            />
          </Flex>

          {/* Custom Git URL */}
          <Flex direction="column">
            <Text weight="bold">{t`Custom Git URL`}</Text>
            <Input
              name="customGitUrl"
              value={formData.customGitUrl}
              onChange={handleInputChange}
              error={!!errors.customGitUrl}
              placeholder={t`Enter a valid GitHub URL`}
            />
            {errors.customGitUrl && (
              <Text color="red">{errors.customGitUrl}</Text>
            )}
          </Flex>

          {/* Custom Git Branch */}
          <Flex direction="column">
            <Text weight="bold">{t`Custom Git Branch`}</Text>
            <Input
              name="customGitBranch"
              value={formData.customGitBranch}
              onChange={handleInputChange}
              placeholder={t`Enter the branch name (e.g., dev)`}
            />
          </Flex>

          {/* Custom Git Build Path */}
          <Flex direction="column">
            <Text weight="bold">{t`Custom Git Build Path`}</Text>
            <Input
              name="customGitBuildPath"
              value={formData.customGitBuildPath}
              onChange={handleInputChange}
              placeholder={t`/`}
            />
          </Flex>

          {/* API URL */}
          <Flex direction="column">
            <Text weight="bold">{t`API URL`}</Text>
            <Input
              name="apiUrl"
              value={formData.apiUrl}
              onChange={handleInputChange}
              error={!!errors.apiUrl}
              placeholder={t`Enter the API URL`}
            />
            {errors.apiUrl && <Text color="red">{errors.apiUrl}</Text>}
          </Flex>

          {/* Token */}
          <Flex direction="column">
            <Text weight="bold">{t`Token`}</Text>
            <Input
              name="token"
              value={formData.token}
              onChange={handleInputChange}
              error={!!errors.token}
              placeholder={t`Enter the token`}
            />
            {errors.token && <Text color="red">{errors.token}</Text>}
          </Flex>

          {/* API Port */}
          <Flex direction="column">
            <Text weight="bold">{t`API Port`}</Text>
            <Input
              name="apiPort"
              value={formData.apiPort}
              type="number"
              onChange={handleInputChange}
              error={!!errors.apiPort}
              placeholder={t`Enter the API port number`}
            />
            {errors.apiPort && <Text color="red">{errors.apiPort}</Text>}
          </Flex>

          {/* Save and Cancel Buttons */}
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
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              onClick={handleSave} // Trigger API call on Save
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
    </>
  );
};

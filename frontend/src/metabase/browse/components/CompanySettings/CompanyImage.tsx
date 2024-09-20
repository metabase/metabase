import { t } from "ttag";
import React, { useState, useEffect } from "react";
import { Button, Flex, Group, Icon, Input, Text, Title } from "metabase/ui";
import { BrowseHeader, BrowseSection } from "./CompanyContainer.styled";
import {
  useGetCompanyDetailsQuery,
  useUpdateCompanyDetailsMutation,
} from "metabase/api/company";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

export const CompanyImage = () => {
  const { data, isLoading, error } = useGetCompanyDetailsQuery({ id: 1 });
  const [updateCompanyDetails] = useUpdateCompanyDetailsMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (data) {
      setCompanyName(data.company_name);
    }
  }, [data]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCompanyName(data?.company_name || "");
  };

  const handleSave = async () => {
    try {
      await updateCompanyDetails({
        id: 1,
        company_name: companyName,
      }).unwrap();
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update company details:", error);
    }
  };

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (error) {
    return <Text color="red">{t`Failed to load company details`}</Text>;
  }

  return (
    <BrowseHeader>
      <BrowseSection>
        <Flex
          w="100%"
          h="2.25rem"
          direction="row"
          justify="space-between"
          align="center"
        >
          <Title
            order={5}
            color="text-dark"
            style={{ position: "relative", width: "100%" }}
          >
            <Group spacing="md" align="center">
              <Icon size={88} color={"#587330"} name="settings_image" />
              {isEditing ? (
                <Flex direction="row" align="center">
                  <Input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder={t`Enter new company name`}
                    style={{ width: "200px", marginRight: "8px" }}
                  />
                  <Group spacing="xs">
                    <Button
                      variant="outlined"
                      onClick={handleCancel}
                      style={{
                        fontWeight: "400",
                        border: "1px solid #587330",
                        color: "#587330",
                        backgroundColor: "#FFF",
                        borderRadius: "8px",
                      }}
                    >
                      {t`Cancel`}
                    </Button>
                    <Button
                      variant="filled"
                      onClick={handleSave}
                      style={{
                        fontWeight: "400",
                        border: "1px solid #587330",
                        color: "#FFF",
                        backgroundColor: "#587330",
                        borderRadius: "8px",
                      }}
                    >
                      {t`Save`}
                    </Button>
                  </Group>
                </Flex>
              ) : (
                <span>{data?.company_name}</span>
              )}
            </Group>

            {!isEditing && (
              <Icon
                name="pencil"
                size={16}
                color="#587330"
                style={{
                  position: "absolute",
                  top: "20",
                  right: "-25",
                  cursor: "pointer",
                }}
                onClick={handleEdit}
              />
            )}
          </Title>
        </Flex>
      </BrowseSection>
    </BrowseHeader>
  );
};

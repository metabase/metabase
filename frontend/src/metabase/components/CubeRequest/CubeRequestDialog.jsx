import React, { useState } from "react";
import { Box, Button, Icon, Textarea } from "metabase/ui";
import Input from "metabase/core/components/Input";
import { useSelector } from "metabase/lib/redux";
import { useCreateCubesRequestDetailsMutation } from "metabase/api/cubes_requests"
import { getUser } from "metabase/selectors/user";

const CubeRequestDialog = ({ isOpen, onClose, requestedFields }) => {
    const user = useSelector(getUser);
    const [description, setDescription] = useState("");
    const [createCubesRequestDetails] = useCreateCubesRequestDetailsMutation()


    const sendAdminRequest = async () => {
        try {
            // Execute the feedback mutation
            await createCubesRequestDetails({
                description: description,
                user: user?.common_name,
                admin_user: null,
                verified_status: false,
                in_semantic_layer: false,
                requested_fields: requestedFields
            }).unwrap();

            // Handle success state
            onClose();
        } catch (error) {
            console.error("Failed to submit feedback:", error);
            // Handle error state
        }
    }

    if (!isOpen) return null;

    return (
        <Box
            style={{
                position: "fixed",
                top: "0",
                left: "0",
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(0, 0, 0, 0.2)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 9999,
            }}
        >
            <Box
                style={{
                    backgroundColor: "#fff",
                    borderRadius: "8px",
                    width: "560px",
                    padding: "24px",
                    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                }}
            >
                <Box as="h2" mb={3} style={{ color: "#5D6064", fontSize: "18px", fontWeight: "600" }}>
                    Ask admin for cube modification
                </Box>
                <Box mb={2}>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "#76797D" }}>
                        Description *
                    </label>
                    <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Please indicate a description for the request"
                        style={{
                            width: "100%",
                            boxSizing: "border-box",
                            marginBottom: "2rem",
                        }}
                    />
                </Box>

                <Box display="flex" flexDirection="column" justifyContent="space-between" style={{ width: "100%", gap: "1rem", marginTop: "1rem" }}>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        style={{ fontWeight: "400", border: "1px solid #587330", color: "#587330", backgroundColor: "#FFF", borderRadius: "8px", width: "100%" }}
                    >
                        Cancel
                    </Button>
                    <Button variant="filled" onClick={sendAdminRequest} style={{ fontWeight: "400", border: "1px solid #587330", color: "#FFF", backgroundColor: "#587330", borderRadius: "8px", width: "100%" }}>
                        Send request
                    </Button>
                </Box>
            </Box>
        </Box>
    );
};

export default CubeRequestDialog;

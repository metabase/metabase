import React, { useState } from "react";
import { Box, Button, Icon, Textarea } from "metabase/ui";
import Input from "metabase/core/components/Input";
import TextArea from "metabase/core/components/TextArea";
import { useSubmitFeedbackMutation } from "metabase/api/feedback";

const FeedbackDialog = ({ isOpen, onClose, messages }) => {
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");
    const [files, setFiles] = useState([]);
    const [submitFeedback] = useSubmitFeedbackMutation();


    const handleFileUpload = (e) => {
        const uploadedFiles = Array.from(e.target.files);
        setFiles((prevFiles) => [...prevFiles, ...uploadedFiles]);
    };

    const handleFileRemove = (fileToRemove) => {
        setFiles(files.filter(file => file !== fileToRemove));
    };

    const handleSubmit = async () => {
        try {
            // Execute the feedback mutation
            await submitFeedback({
                description: description,
                task: "General Feedback",
                submitted_by: "John Doe",
                chat_history: JSON.stringify(messages),
                subject: subject,
            }).unwrap();

            // Handle success state
            console.log("Feedback submitted successfully!");
            onClose();
        } catch (error) {
            console.error("Failed to submit feedback:", error);
            // Handle error state
        }
    };

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
                    Provide Feedback
                </Box>
                <Box as="h2" mb={3} style={{ color: "#5D6064", fontSize: "12px", fontWeight: "400", marginBottom: "2rem" }}>
                    Whether you are new or need extra support, our team is ready to assist you. We want to make sure you have a great experience.
                </Box>
                <Box mb={2}>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "#76797D" }}>
                        Subject *
                    </label>
                    <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="What is the issue about?"
                        style={{
                            width: "100%",
                            boxSizing: "border-box",
                            marginBottom: "2rem",
                        }}
                    />
                </Box>
                <Box mb={2}>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "12px", color: "#76797D" }}>
                        Description *
                    </label>
                    <TextArea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add a description about the issue"
                        rows="4"
                        style={{
                            width: "100%",
                            resize: "none",
                            overflowY: "auto",
                            maxHeight: "150px",
                            boxSizing: "border-box",
                            marginBottom: "2rem",
                        }}
                    />
                </Box>
                <Box mb={3}>
                    <label style={{ fontWeight: "600", display: "block", marginBottom: "8px", fontSize: "14px", color: "#76797D" }}>
                        Attach files
                    </label>
                    <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        style={{ display: "block", marginBottom: "8px", width: "100%" }}
                    />
                    <Box>
                        {files.map((file, index) => (
                            <Box key={index} style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                                <span style={{ marginRight: "8px", flexGrow: 1 }}>{file.name}</span>
                                <Icon
                                    size={18}
                                    style={{
                                        color: "#29920E",
                                        marginRight: "8px",
                                    }}
                                    name={"check"}
                                />
                                <Icon
                                    onClick={() => handleFileRemove(file)}
                                    size={18}
                                    style={{
                                        cursor: "pointer",
                                        color: "#76797D"
                                    }}
                                    name={"trash"}
                                />
                            </Box>
                        ))}
                    </Box>
                </Box>
                <Box display="flex" flexDirection="column" justifyContent="space-between" style={{ width: "100%", gap: "1rem", marginTop: "1rem" }}>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        style={{ fontWeight: "400", border: "1px solid #223800", color: "#223800", backgroundColor: "#FFF", borderRadius: "8px", width: "100%" }}
                    >
                        Cancel
                    </Button>
                    <Button variant="filled" onClick={handleSubmit} style={{ fontWeight: "400", border: "1px solid #223800", color: "#FFF", backgroundColor: "#223800", borderRadius: "8px", width: "100%" }}>
                        Send feedback
                    </Button>
                </Box>
            </Box>
        </Box>
    );
};

export default FeedbackDialog;

import React, { useState } from "react";
import { Box, Button, Icon, Textarea } from "metabase/ui";
import Input from "metabase/core/components/Input";
import TextArea from "metabase/core/components/TextArea";

const FeedbackDialog = ({ isOpen, onClose }) => {
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");
    const [files, setFiles] = useState([]);

    const handleFileUpload = (e) => {
        const uploadedFiles = Array.from(e.target.files);
        setFiles((prevFiles) => [...prevFiles, ...uploadedFiles]);
    };

    const handleFileRemove = (fileToRemove) => {
        setFiles(files.filter(file => file !== fileToRemove));
    };

    const handleSubmit = () => {
        console.log("Subject:", subject);
        console.log("Description:", description);
        console.log("Uploaded Files:", files);
        onClose();
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
                    width: "400px",
                    padding: "24px",
                    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                }}
            >
                <Box as="h2" mb={3}>
                    Provide Feedback
                </Box>
                <Box mb={2}>
                    <label style={{ fontWeight: "bold", display: "block", marginBottom: "4px" }}>
                        Subject *
                    </label>
                    <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="What is the issue about?"
                    />
                </Box>
                <Box mb={2}>
                    <label style={{ fontWeight: "bold", display: "block", marginBottom: "4px" }}>
                        Description *
                    </label>
                    <TextArea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add a description about the issue"
                        rows="4"
                        style={{
                            resize: "none",
                            overflowY: "auto",
                            maxHeight: "150px",
                        }}
                    />
                </Box>
                <Box mb={3}>
                    <label style={{ fontWeight: "bold", display: "block", marginBottom: "8px" }}>
                        Attach files
                    </label>
                    <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        style={{ display: "block", marginBottom: "8px" }}
                    />
                    <Box>
                        {files.map((file, index) => (
                            <Box key={index} style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                                <span style={{ marginRight: "8px" }}>{file.name}</span>
                                <Button
                                    variant="link"
                                    onClick={() => handleFileRemove(file)}
                                    style={{ color: "#FF6B6B", padding: "0", cursor: "pointer" }}
                                >
                                    ✕
                                </Button>
                            </Box>
                        ))}
                    </Box>
                </Box>
                <Box display="flex" justifyContent="flex-end">
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        style={{ marginRight: "8px" }}
                    >
                        Cancel
                    </Button>
                    <Button variant="filled" onClick={handleSubmit}>
                        Send Feedback
                    </Button>
                </Box>
            </Box>
        </Box>
    );
};

export default FeedbackDialog;

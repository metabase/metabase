const FeedbackDialog = ({ isOpen, onClose }) => {
    const handleSendEmail = () => {
        window.location.href = "mailto:info@omniloy.com";
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div
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
            <div
                style={{
                    backgroundColor: "#fff",
                    borderRadius: "8px",
                    width: "70%",
                    overflowY: "auto",
                    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    color: "#46474C",
                }}
            >
                <div
                    style={{
                        padding: "16px 24px",
                        fontSize: "1.25rem",
                        fontWeight: "bold",
                        borderBottom: "1px solid #e0e0e0",
                    }}
                >
                    Provide Feedback
                </div>
                <div
                    style={{
                        padding: "16px 24px",
                        flex: "1",
                        fontSize: "1rem",
                        lineHeight: "1.5",
                        marginBottom: "16px",
                    }}
                >
                    Please provide screenshots of the problem encountered or any other
                    issues or detail the problem.
                </div>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        padding: "16px 24px",
                        borderTop: "1px solid #e0e0e0",
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            marginRight: "8px",
                            padding: "8px 16px",
                            border: "1px solid #76787D",
                            borderRadius: "999px",
                            backgroundColor: "transparent",
                            color: "#76787D",
                            cursor: "pointer",
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSendEmail}
                        style={{
                            padding: "8px 32px",
                            borderRadius: "999px",
                            backgroundColor: "#0458DD",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                        }}
                    >
                        Send Email
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FeedbackDialog;

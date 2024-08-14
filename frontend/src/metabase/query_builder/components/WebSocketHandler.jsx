
import { useState } from "react";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon } from "metabase/ui";
import Input from "metabase/core/components/Input";
import useWebSocket from "metabase/hooks/useWebSocket";
import ChatMessageList from "metabase/components/ChatMessageList/ChatMessageList";
import { CardApi } from "metabase/services";
import Question from "metabase-lib/v1/Question";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import { loadMetadataForCard } from "metabase/questions/actions";
import { push } from "react-router-redux";
import Modal from "metabase/components/Modal";
import { assistant_url } from "metabase/env";

const WebSocketHandler = () => {
    const [inputValue, setInputValue] = useState("");
    const [messages, setMessages] = useState([]);
    const [card, setCard] = useState(null);
    const [result, setResult] = useState(null);
    const [defaultQuestion, setDefaultQuestion] = useState(null);
    const [dataInfo, setDataInfo] = useState("");
    const dispatch = useDispatch();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [id, setId] = useState(0);
    const { ws, isConnected } = useWebSocket(
        assistant_url,
        async e => {
            if (e.data) {
                const data = JSON.parse(e.data);
                switch (data.type) {
                    case "tool":
                        await handleFunctionalityMessages(data.functions);
                        break;
                    case "result":
                        await handleResultMessage(data);
                        break;
                    default:
                        handleDefaultMessage(data);
                        break;
                }
            }
        },
        () => console.error("WebSocket error"),
        () => console.log("WebSocket closed"),
        () => console.log("WebSocket opened"),
    );

    const openModal = () => {
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
    };



    const handleFunctionalityMessages = async functions => {
        functions.forEach(async func => {
            switch (func.function_name) {
                case "getDatasetQuery":
                    await handleGetDatasetQuery(func);
                    break;
                default:
                    console.log(func);
                    break;
            }
        });
    };

    const handleGetDatasetQuery = async func => {
        setId(func.arguments.cardId);
        try {
            const fetchedCard = await CardApi.get({ cardId: func.arguments.cardId });
            const queryCard = await CardApi.query({ cardId: func.arguments.cardId });
            const cardMetadata = await dispatch(loadMetadataForCard(fetchedCard));
            setResult(queryCard);
            const getDatasetQuery = fetchedCard?.dataset_query;
            const defaultQuestionTest = Question.create({
                databaseId: 1,
                name: fetchedCard.name,
                type: "query",
                display: fetchedCard.display,
                visualization_settings: {},
                dataset_query: getDatasetQuery,
                metadata: cardMetadata.payload.entities
            });
            const newQuestion = defaultQuestionTest.setCard(fetchedCard);
            setDefaultQuestion(newQuestion);
            setCard(fetchedCard);
        } catch (error) {
            console.error("Error fetching card content:", error);
        }
    };

    const handleDefaultMessage = data => {
        addServerMessage(
            data.message || "Received a message from the server.",
            "text",
        );
    };

    const handleResultMessage = data => {
        setDataInfo(data.message);
    };

    const redirect = () => {
        dispatch(push(`/question/${id}`));
    }

    const addServerMessage = (message, type) => {
        setMessages(prevMessages => [
            ...prevMessages,
            {
                id: Date.now(),
                text: message,
                sender: "server",
                type: type,
            },
        ]);
    };

    const sendMessage = () => {
        if (!inputValue.trim()) return;
        if (isConnected) {
            ws.send(
                JSON.stringify({
                    type: "configure",
                    configData: [1],
                }),
            );
        }

        const userMessage = {
            id: Date.now(),
            text: inputValue,
            sender: "user",
            type: "text",
            thread_id: 1,
        };

        setMessages(prevMessages => [...prevMessages, userMessage]);

        const response = {
            type: "query",
            task: inputValue,
            thread_id: 1,
        };
        if (isConnected) {
            ws && ws.send(JSON.stringify(response));
            setInputValue("");
        }
    };
    return (
        <>
            <Box
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "80vh",
                    width: "100%",
                }}
            >
                <div
                    style={{
                        flex: card ? "0 1 auto" : "1 1 auto",
                        overflowY: "auto",
                        padding: "16px",
                        backgroundColor: "#FFF",
                        borderRadius: card ? "0 0 12px 12px" : "12px",
                    }}
                >
                    <ChatMessageList messages={messages} />
                </div>

                {card && (
                    <>
                        <div
                            style={{
                                flex: "1 0 50%",
                                padding: "16px",
                                overflow: "hidden",
                                minHeight: "400px",
                            }}
                        >
                            <VisualizationResult
                                question={defaultQuestion}
                                isDirty={false}
                                queryBuilderMode={"view"}
                                result={result}
                                className={"chat__visualization___3Z6Z-"}
                                rawSeries={[{ card, data: result && result.data }]}
                                isRunning={false}
                                navigateToNewCardInsideQB={null}
                                onNavigateBack={() => console.log('back')}
                                timelineEvents={[]}
                                selectedTimelineEventIds={[]}
                            />
                        </div>
                        <Button
                            variant="outlined"
                            style={{ width: 200, cursor: "pointer", border: "1px solid #E0E0E0", marginBottom: "1rem", text: "center", color: "#000", marginLeft: "auto", marginRight: 0 }}
                            onClick={openModal}
                        >
                            Review & Save
                        </Button>
                    </>

                )}

                <div
                    style={{
                        flexShrink: 0,
                        padding: "16px",
                        backgroundColor: "#FFF",
                        borderTop: "1px solid #E0E0E0",
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    <Input
                        id="1"
                        type="text"
                        fullWidth
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        style={{ marginRight: "8px" }}
                    />
                    <Button
                        variant="filled"
                        disabled={!isConnected}
                        onClick={sendMessage}
                        style={{ borderRadius: "12px", padding: "8px" }}
                    >
                        <Icon size={28} style={{ marginTop: "4px", marginBottom: "auto", padding: "0px", paddingLeft: "4px", paddingRight: "4px" }} name="sendChat" />
                    </Button>
                </div>
            </Box>
            {isModalOpen && (
                <Modal isOpen={isModalOpen} onClose={closeModal}>
                    <div style={{ padding: "20px" }}>
                        <h2 style={{ marginBottom: "10px" }}>Save question</h2>
                        {dataInfo !== "" && (
                            <>
                                <strong>Data generation insight:</strong>
                                <p>{dataInfo}</p>
                            </>
                        )}
                        <p>Please go to builder to review and save your question.</p>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                            <Button variant="outlined" style={{ marginRight: "10px" }} onClick={closeModal}>
                                Cancel
                            </Button>
                            <Button variant="filled" onClick={() => { redirect(); closeModal(); }}>
                                Go to builder
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};

export default WebSocketHandler;

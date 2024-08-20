import { useEffect, useState } from "react";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon } from "metabase/ui";
import Input from "metabase/core/components/Input";
import useWebSocket from "metabase/hooks/useWebSocket";
import ChatMessageList from "metabase/components/ChatMessageList/ChatMessageList";
import FeedbackDialog from "metabase/components/FeedbackDialog/FeedbackDialog";
import { CardApi } from "metabase/services";
import Question from "metabase-lib/v1/Question";
import VisualizationResult from "metabase/query_builder/components/VisualizationResult";
import { loadMetadataForCard } from "metabase/questions/actions";
import { push } from "react-router-redux";
import Modal from "metabase/components/Modal";
import { Tabs } from "metabase/ui";
import CS from "metabase/css/core/index.css";
import cx from "classnames";
import { generateRandomId } from "metabase/lib/utils";

const WebSocketHandler = () => {
    const dispatch = useDispatch();
    const assistant_url = process.env.REACT_APP_WEBSOCKET_SERVER;
    const [inputValue, setInputValue] = useState("");
    const [messages, setMessages] = useState([]);
    const [card, setCard] = useState(null);
    const [reasoning, setReasoning] = useState(null);
    const [sources, setSources] = useState(null);
    const [result, setResult] = useState(null);
    const [defaultQuestion, setDefaultQuestion] = useState(null);
    const [codeQuery, setCodeQuery] = useState(null);
    const [isDBModalOpen, setIsDBModalOpen] = useState(false);
    const [dbInputValue, setDBInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTab, setSelectedTab] = useState("reasoning");
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const threadId = generateRandomId();
    const [insightsList, setInsightsList] = useState([]);

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
                case "getInsights":
                    await handleGetInsights(func);
                    break;
                default:
                    console.log(func);
                    break;
            }
        });
    };

    const handleGetDatasetQuery = async func => {
        const { cardId, reasoning, sources } = func.arguments;
        setSources(sources);
        setReasoning(reasoning);
        setId(func.arguments.cardId);
        try {
            const fetchedCard = await CardApi.get({ cardId: cardId });
            const queryCard = await CardApi.query({ cardId: cardId });
            const cardMetadata = await dispatch(loadMetadataForCard(fetchedCard));
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
            setResult(queryCard);
            setCodeQuery(queryCard.data.native_form.query);
            setDefaultQuestion(newQuestion);
            setCard(fetchedCard);
        } catch (error) {
            console.error("Error fetching card content:", error);
        } finally {
            setIsLoading(false);
            removeLoadingMessage();
        }
    };

    const handleGetInsights = async func => {
        const { insights } = func.arguments;
        try {
            const newInsightsList = [];

            for (const insight of insights) {
                const fetchedCard = await CardApi.get({ cardId: insight.cardId });
                const queryCard = await CardApi.query({ cardId: insight.cardId });
                const cardMetadata = await dispatch(loadMetadataForCard(fetchedCard));
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

                newInsightsList.push({
                    insightExplanation: insight.insightExplanation,
                    card: fetchedCard,
                    queryCard: queryCard,
                    defaultQuestion: newQuestion,
                });
            }

            setInsightsList(prevInsights => [...prevInsights, ...newInsightsList]);

        } catch (error) {
            console.error("Error fetching card content:", error);
        } finally {
            setIsLoading(false);
            removeLoadingMessage();
        }
    };

    const handleDefaultMessage = data => {
        addServerMessage(
            data.message || "Received a message from the server.",
            "text",
        );
    };

    const handleResultMessage = data => {
        addServerMessage(
            data.message || "Received a message from the server.",
            "text",
        );
        setIsLoading(false);
        removeLoadingMessage();
    };

    const redirect = () => {
        dispatch(push(`/question/${id}`));
    }

    const addServerMessage = (message, type) => {
        setMessages(prevMessages => [
            ...prevMessages,
            {
                id: Date.now() + Math.random(),
                text: message,
                sender: "server",
                type: type,
            }
        ]);
    };

    const sendMessage = () => {
        if (!inputValue.trim()) return;
        setIsLoading(true);
        if (isConnected) {
            ws.send(
                JSON.stringify({
                    type: "configure",
                    configData: [dbInputValue || 9],
                }),
            );
        }

        setMessages(prevMessages => [
            ...prevMessages,

            {
                id: Date.now() + Math.random(),
                text: inputValue,
                sender: "user",
                type: "text",
                thread_id: threadId,
            },
            {
                id: Date.now() + Math.random(),
                text: "Please wait until we generate the response....",
                sender: "server",
                type: "text",
            },

        ]);
        const response = {
            type: "query",
            task: inputValue,
            thread_id: threadId,
        };
        if (isConnected) {
            ws && ws.send(JSON.stringify(response));
            setInputValue("");
        }
    };

    const removeLoadingMessage = () => {
        setMessages(prevMessages => prevMessages.filter(
            message => message.text !== "Please wait until we generate the response...."
        ));
    };

    const handleKeyPress = (e) => {
        if (e.charCode === 13 && inputValue.trim()) {
            sendMessage();
        }
    };

    const handleFeedbackDialogOpen = () => {
        setIsModalOpen(false);
        setIsFeedbackDialogOpen(!isFeedbackDialogOpen);
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
                <Button
                    variant="outlined"
                    style={{
                        position: "absolute",
                        top: "16px",
                        right: "16px",
                        cursor: "pointer",
                        padding: "8px",
                        color: "#FFF",
                        borderRadius: "50%",
                    }}
                    onClick={() => setIsDBModalOpen(true)}
                >
                </Button>
                <div
                    style={{
                        flex: "1 1 auto",
                        overflowY: "auto",
                        padding: "16px",
                        backgroundColor: "#FFF",
                        borderRadius: "12px",
                    }}
                >
                    <ChatMessageList messages={messages} isLoading={isLoading} />
                    
                    {card && defaultQuestion && result && (
                        <>
                            <div
                                style={{
                                    flex: "1 0 50%",
                                    padding: "16px",
                                    overflow: "hidden",
                                    height: "400px",
                                    width: "auto",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                }}
                            >
                                <VisualizationResult
                                    question={defaultQuestion}
                                    isDirty={false}
                                    queryBuilderMode={"view"}
                                    result={result}
                                    className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
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
                                style={{
                                    width: "auto",
                                    cursor: "pointer",
                                    border: "1px solid #E0E0E0",
                                    borderRadius: "8px",
                                    marginBottom: "1rem",
                                    color: "#FFF",
                                    marginLeft: "auto",
                                    marginRight: 0,
                                    backgroundColor: "#8A64DF",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "0.5rem 1rem",
                                    lineHeight: "1",
                                }}
                                onClick={openModal}
                            >
                                <Icon
                                    size={18}
                                    name="bookmark"
                                    style={{
                                        marginRight: "0.5rem",
                                    }}
                                />
                                <span style={{ fontSize: "18px", fontWeight: "lighter", verticalAlign: "top" }}>Verify & Save</span>
                            </Button>
                        </>
                    )}

                    {insightsList.map((insight, index) => (
                        <div key={index} style={{ marginBottom: "2rem" }}>
                            <div style={{ marginBottom: "1rem" }}>
                                <strong>Insight:</strong> {insight.insightExplanation}
                            </div>
                            <div
                                style={{
                                    padding: "16px",
                                    overflow: "hidden",
                                    height: "400px",
                                    width: "auto",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    border: "1px solid #E0E0E0",
                                    borderRadius: "8px",
                                    backgroundColor: "#F8FAFD",
                                }}
                            >
                                <VisualizationResult
                                    question={insight.defaultQuestion}
                                    isDirty={false}
                                    queryBuilderMode={"view"}
                                    result={insight.queryCard}
                                    className={cx(CS.flexFull, CS.fullWidth, CS.fullHeight)}
                                    rawSeries={[{ card: insight.card, data: insight.queryCard && insight.queryCard.data }]}
                                    isRunning={false}
                                    navigateToNewCardInsideQB={null}
                                    onNavigateBack={() => console.log('back')}
                                    timelineEvents={[]}
                                    selectedTimelineEventIds={[]}
                                />
                            </div>
                        </div>
                    ))}
                </div>

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
                        size="large"
                        placeholder="Enter a prompt here..."
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        style={{ marginRight: "8px" }}
                    />
                    <Button
                        variant="filled"
                        disabled={!isConnected}
                        onClick={sendMessage}
                        style={{ borderRadius: "12px", padding: "0px", backgroundColor: !isConnected ? "#F1EBFF" : "#8A64DF", color: "#FFF", border: "none" }}
                    >
                        <Icon size={26} style={{ padding: "6px", marginTop: "4px", marginLeft: "4px", marginRight: "4px" }} name="sendChat" />
                    </Button>
                </div>
            </Box>

            {isDBModalOpen && (
                <Modal isOpen={isDBModalOpen} onClose={() => setIsDBModalOpen(false)}>
                    <div style={{ padding: "20px" }}>
                        <h2 style={{ marginBottom: "10px" }}>Enter DB Value</h2>
                        <Input
                            id="dbInput"
                            type="text"
                            value={dbInputValue}
                            onChange={(e) => setDBInputValue(e.target.value)}
                            style={{ marginBottom: "20px" }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <Button variant="outlined" style={{ marginRight: "10px" }} onClick={() => setIsDBModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="filled" onClick={() => setIsDBModalOpen(false)}>
                                Save
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
            {isModalOpen && (
                <Modal isOpen={isModalOpen} onClose={closeModal}>
                    <div style={{ padding: "20px", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                            <h2 style={{ fontSize: "24px", fontWeight: "600", margin: 0, paddingLeft: "1rem" }}>Verify results</h2>
                            <Icon
                                name="close"
                                size={24}
                                style={{ cursor: "pointer", color: "#76797D", paddingRight: "1rem" }}
                                onClick={closeModal}
                            />
                        </div>
                        <div style={{ marginBottom: "20px", paddingLeft: "1rem", paddingRight: "1rem" }}>
                            <h4 style={{ marginBottom: "10px", color: "#5B6B7B", fontWeight: "600" }}>Sources</h4>
                            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                                {sources?.tables?.map((table, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            padding: "8px 12px",
                                            backgroundColor: "#F8FAFD",
                                            borderRadius: "8px",
                                            border: "1px solid #E1E5EB",
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "flex-start",
                                        }}
                                    >
                                        <div style={{ fontWeight: "500", color: "#3A4A58" }}>Table: {table.tableName}</div>
                                        <div style={{ marginTop: "8px", color: "#76797D", fontSize: "14px" }}>
                                            Fields: {table.fields.join(", ")}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Tabs
                            value={selectedTab}
                            onChange={(newTab) => setSelectedTab(newTab)}
                            style={{
                                flexGrow: 1,
                                display: "flex",
                                flexDirection: "column",
                                paddingLeft: "1rem",
                                paddingRight: "1rem",
                            }}
                        >
                            <Tabs.List
                                style={{
                                    borderBottom: "none",
                                }}
                            >
                                <Tabs.Tab
                                    value="reasoning"
                                    style={{
                                        backgroundColor: selectedTab === "reasoning" ? "#F8FAFD" : "#FFFFFF",
                                        color: selectedTab === "reasoning" ? "#0458DD" : "#76797D",
                                        borderBottom: "none",
                                    }}
                                    onClick={() => setSelectedTab("reasoning")}
                                >
                                    Reasoning
                                </Tabs.Tab>
                                <Tabs.Tab
                                    value="codeQuery"
                                    style={{
                                        backgroundColor: selectedTab === "codeQuery" ? "#F8FAFD" : "#FFFFFF",
                                        color: selectedTab === "codeQuery" ? "#0458DD" : "#76797D",
                                        borderBottom: "none",
                                    }}
                                    onClick={() => setSelectedTab("codeQuery")}
                                >
                                    Code Query
                                </Tabs.Tab>
                                <Tabs.Tab
                                    value="aiDefinitions"
                                    style={{
                                        backgroundColor: selectedTab === "aiDefinitions" ? "#F8FAFD" : "#FFFFFF",
                                        color: selectedTab === "aiDefinitions" ? "#0458DD" : "#76797D",
                                        borderBottom: "none",
                                    }}
                                    onClick={() => setSelectedTab("aiDefinitions")}
                                    disabled
                                >
                                    AI Definitions
                                </Tabs.Tab>
                                <Tabs.Tab
                                    value="joins"
                                    style={{
                                        backgroundColor: selectedTab === "joins" ? "#F8FAFD" : "#FFFFFF",
                                        color: selectedTab === "joins" ? "#0458DD" : "#76797D",
                                        borderBottom: "none",
                                    }}
                                    onClick={() => setSelectedTab("joins")}
                                    disabled
                                >
                                    Joins
                                </Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel
                                value="reasoning"
                                style={{ backgroundColor: "#F8FAFD", padding: "1rem", height: "350px", overflowY: "auto", borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px" }}
                            >
                                {reasoning.split("\n").map((point, index) => (
                                    point.trim() && (
                                        <p key={index} style={{ marginBottom: "1rem", fontSize: "16px" }}>
                                            {point}
                                        </p>
                                    )
                                ))}
                            </Tabs.Panel>

                            <Tabs.Panel
                                value="codeQuery"
                                style={{ backgroundColor: "#F8FAFD", padding: "1rem", height: "350px", overflowY: "auto", borderBottomLeftRadius: "12px", borderBottomRightRadius: "12px" }}
                            >
                                <pre style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>{codeQuery}</pre>
                            </Tabs.Panel>
                        </Tabs>

                        <div style={{ display: "flex", marginTop: "20px", paddingLeft: "1rem", paddingRight: "1rem", gap: "2rem" }}>
                            <Button
                                variant="outlined"
                                style={{
                                    flex: 1,
                                    borderColor: "#1664D6",
                                    color: "#1664D6",
                                    marginRight: "1px",
                                    height: "50px",
                                    fontSize: "16px",
                                    fontWeight: "500",
                                    border: "1px solid #1664D6",
                                }}
                                onClick={handleFeedbackDialogOpen}
                            >
                                Provide feedback
                            </Button>
                            <Button
                                variant="filled"
                                style={{
                                    flex: 1,
                                    backgroundColor: "#1664D6",
                                    color: "#FFFFFF",
                                    height: "50px",
                                    fontSize: "16px",
                                    fontWeight: "500",
                                    marginLeft: "1px",
                                }}
                                onClick={() => { redirect(); }}
                            >
                                Go to builder & save
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
            <FeedbackDialog
                isOpen={isFeedbackDialogOpen}
                onClose={handleFeedbackDialogOpen}
            />
        </>
    );
};

export default WebSocketHandler;

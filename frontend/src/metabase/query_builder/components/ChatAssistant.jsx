import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon, Textarea } from "metabase/ui";
import Input from "metabase/core/components/Input";
import TextArea from "metabase/core/components/TextArea";
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
import {
    adhocQuestionHash
} from "e2e/support/helpers/e2e-ad-hoc-question-helpers";
import { useSelector } from "metabase/lib/redux";
import { getInitialMessage } from "metabase/redux/initialMessage";

const ChatAssistant = ({ selectedMessages, selectedThreadId, chatType }) => {
    const initialMessage = useSelector(getInitialMessage);
    const inputRef = useRef(null);
    const dispatch = useDispatch();
    const assistant_url = process.env.REACT_APP_WEBSOCKET_SERVER;
    const company_name = process.env.COMPANY_NAME;
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
    const [cardHash, setCardHash] = useState(null);
    const [id, setId] = useState(0);
    const [useTextArea, setUseTextArea] = useState(false);
    const [error, setError] = useState(null);
    const [toolWaitingResponse, setToolWaitingResponse] = useState(null);
    const [approvalChangeButtons, setApprovalChangeButtons] = useState(false);

    useEffect(() => {
        setMessages([])
        setInputValue("")
    }, [])

    useEffect(() => {
        if (selectedMessages && selectedThreadId && selectedMessages.length > 0) {
            const parsedMessages = selectedMessages.flatMap((messageGroup) => {
                return messageGroup.text.map(([senderType, messageText]) => ({
                    id: generateRandomId(),
                    text: messageText,
                    sender: senderType === "human" ? "user" : "server",
                    type: "text",
                    thread_id: selectedThreadId,
                }));
            });

            setMessages(parsedMessages);
        }
    }, [selectedMessages]);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = "100px";
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [inputValue]);

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
        if (inputRef.current) {
            inputRef.current.style.height = "100px";
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    };

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
                case "calculationOptions":
                    await handleGetCalulationOptions(func);
                    break;
                case "approveSemantycLayerChanges":
                    await handleApproveSLChanges(func);
                    break;
                case "processInfo":
                    await handleProcessInfo(func);
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
            const itemtohash = {
                dataset_query: {
                    database: getDatasetQuery.database,
                    type: "query",
                    query: getDatasetQuery.query
                },
                display: fetchedCard.display,
                visualization_settings: {},
                type: "question"
            }
            const newQuestion = defaultQuestionTest.setCard(fetchedCard);
            setResult(queryCard);
            setCodeQuery(queryCard.data.native_form.query);
            setDefaultQuestion(newQuestion);
            setCard(fetchedCard);
            const hash1 = adhocQuestionHash(itemtohash);
            setCardHash(hash1)
        } catch (error) {
            console.error("Error fetching card content:", error);
            setError("There was an error fetching the dataset. Please provide feedback if this issue persists.");
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
            setError("There was an error fetching the insights. Please provide feedback if this issue persists.");
        } finally {
            setIsLoading(false);
            removeLoadingMessage();
        }
    };


    const handleGetCalulationOptions = async func => {
        const { calculationOptions } = func.arguments;
        console.log(calculationOptions)
        //Show calculationOptions and send a response from the user
        addServerMessage(
            calculationOptions || "Received a message from the server.",
            "text",
        );
        setToolWaitingResponse("calculationOptions");
    };

    const handleApproveSLChanges = async func => {
        const { newFields } = func.arguments;
        //Show newFields and send a response with 'true' or 'false' as string
        addServerMessage(
            newFields || "Received a message from the server.",
            "text",
        );
        setToolWaitingResponse("approveSemantycLayerChanges");
        setApprovalChangeButtons(true);
    };

    const handleProcessInfo = async func => {
        const { infoMessage } = func.arguments;
        //Only print infoMessage
        addServerMessage(
            infoMessage || "Received a message from the server.",
            "text",
        );
        setIsLoading(false);
        removeLoadingMessage();
    };

    const handleDefaultMessage = data => {
        addServerMessage(
            data.message || "Received a message from the server.",
            "text",
        );
    };

    const handleResultMessage = data => {
        const hasError =
            data.message.toLowerCase().includes("error") ||
            data.message.toLowerCase().includes("failed");
        addServerMessage(
            data.message || "Received a message from the server.",
            "text",
        );
        if (hasError) {
            setError(data.message);
        }
        setIsLoading(false);
        removeLoadingMessage();
    };

    const redirect = async () => {
        dispatch(push(`/question#${cardHash}`));
        const deletedCard = await CardApi.delete({ id: id });
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

        if (toolWaitingResponse) {
            setMessages(prevMessages => [
                ...prevMessages,
                {
                    id: Date.now() + Math.random(),
                    text: inputValue,
                    sender: "user",
                    type: "text",
                    thread_id: threadId,
                }
            ]);
            ws.send(
                JSON.stringify({
                    type: "toolResponse",
                    response: {
                        function_name: toolWaitingResponse,
                        response: JSON.stringify(inputValue),
                    },
                })
            );
            setToolWaitingResponse(null);
            setInputValue("");
            return;
        }


        setIsLoading(true);
        if (isConnected) {
            ws.send(
                JSON.stringify({
                    type: "configure",
                    configData: [dbInputValue || 9, company_name],
                    appType: chatType,
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
            appType: chatType,
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
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault(); // Prevent the default behavior of creating a new line
            sendMessage();
        }
    };

    const handleFeedbackDialogOpen = () => {
        setIsModalOpen(false);
        setIsFeedbackDialogOpen(!isFeedbackDialogOpen);
    };

    const handleAccept = () => {
        ws.send(
            JSON.stringify({
                type: "toolResponse",
                response: {
                    function_name: toolWaitingResponse,
                    response: "true",
                },
            })
        );
        setApprovalChangeButtons(false);
    };

    const handleDeny = () => {
        ws.send(
            JSON.stringify({
                type: "toolResponse",
                response: {
                    function_name: toolWaitingResponse,
                    response: "false",
                },
            })
        );
        setApprovalChangeButtons(false);
    };

    useEffect(() => {
        if (initialMessage.message) {
            setInputValue(initialMessage.message);
            if (inputValue && ws) {
                sendMessage();
                setInputValue("");
            }
        }
    }, [initialMessage, ws]);

    return (
        <>
            <Box
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "85vh",
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
                        borderRadius: "12px",
                        marginBottom: "150px", // Adjust this value based on the input area height
                    }}
                >

                    <ChatMessageList messages={messages} isLoading={isLoading} onFeedbackClick={handleFeedbackDialogOpen}
                        approvalChangeButtons={approvalChangeButtons} onApproveClick={handleAccept} onDenyClick={handleDeny}
                    />

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
                                    display: "flex",
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
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center", // Center horizontally
                            width: "calc(100% - 600px)",
                            backgroundColor: "#FFF",
                            position: "fixed",
                            bottom: "5rem",
                            left: "150px",
                            zIndex: 10,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                width: "100%",
                                padding: "8px",
                                border: "1px solid #E0E0E0",
                                borderRadius: "8px",
                                backgroundColor: "#F8FAFD",
                                position: "relative", // Important for absolute positioning inside this div
                            }}
                        >
                            <TextArea
                                ref={inputRef}
                                value={inputValue}
                                onChange={handleInputChange}
                                onKeyPress={handleKeyPress}
                                placeholder="Enter a prompt here..."
                                style={{
                                    width: "100%",
                                    resize: "none",
                                    overflowY: "auto",
                                    height: "100px",
                                    minHeight: "100px",
                                    maxHeight: "220px",
                                    padding: "12px",
                                    paddingRight: "50px", // Space for the send button
                                    lineHeight: "24px",
                                    border: "none",
                                    outline: "none",
                                    boxSizing: "border-box",
                                    borderRadius: "8px",
                                    backgroundColor: "transparent",
                                }}
                            />
                            <Button
                                variant="filled"
                                disabled={!isConnected}
                                onClick={sendMessage}
                                style={{
                                    position: "absolute",
                                    right: "10px",
                                    bottom: "10px",
                                    borderRadius: "8px",
                                    width: "40px",
                                    height: "40px",
                                    padding: "0",
                                    minWidth: "0",
                                    backgroundColor: isConnected ? "#8A64DF" : "#F1EBFF",
                                    color: "#FFF",
                                    border: "none",
                                    cursor: isConnected ? "pointer" : "not-allowed",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                }}
                            >
                                <Icon size={26} name="sendChat" />
                            </Button>
                        </div>
                    </div>


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
                messages={messages}

            />
        </>
    );
};

export default ChatAssistant;

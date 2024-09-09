import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon} from "metabase/ui";
import Input from "metabase/core/components/Input";
import TextArea from "metabase/core/components/TextArea";
import useWebSocket from "metabase/hooks/useWebSocket";
import ChatMessageList from "metabase/components/ChatMessageList/ChatMessageList";
import FeedbackDialog from "metabase/components/FeedbackDialog/FeedbackDialog";
import { CardApi } from "metabase/services";
import Question from "metabase-lib/v1/Question";
import { push } from "react-router-redux";
import Modal from "metabase/components/Modal";
import { Tabs } from "metabase/ui";
import { generateRandomId } from "metabase/lib/utils";
import {
    adhocQuestionHash
} from "e2e/support/helpers/e2e-ad-hoc-question-helpers";
import { useSelector } from "metabase/lib/redux";
import { getInitialMessage } from "metabase/redux/initialMessage";
import { getDBInputValue, getCompanyName } from "metabase/redux/initialDb";
import { useListDatabasesQuery } from "metabase/api";
import { SemanticError } from "metabase/components/ErrorPages";
const ChatAssistant = ({ selectedMessages, selectedThreadId, chatType, oldCardId, insights }) => {
    const initialMessage = useSelector(getInitialMessage);
    const initialDbName = useSelector(getDBInputValue);
    const initialCompanyName = useSelector(getCompanyName);
    const inputRef = useRef(null);
    const dispatch = useDispatch();
    const assistant_url = process.env.REACT_APP_WEBSOCKET_SERVER;
    const [companyName, setCompanyName] = useState("");
    const [inputValue, setInputValue] = useState("");
    const [messages, setMessages] = useState([]);
    const [card, setCard] = useState([]);
    const [reasoning, setReasoning] = useState([]);
    const [sources, setSources] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(null)
    const [result, setResult] = useState([]);
    const [defaultQuestion, setDefaultQuestion] = useState([]);
    const [codeQuery, setCodeQuery] = useState([]);
    const [isDBModalOpen, setIsDBModalOpen] = useState(false);
    const [dbInputValue, setDBInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTab, setSelectedTab] = useState("reasoning");
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const [threadId, setThreadId] = useState('')
    const [insightsList, setInsightsList] = useState([]);
    const [cardHash, setCardHash] = useState([]);
    const [id, setId] = useState(0);
    const [useTextArea, setUseTextArea] = useState(false);
    const [showError, setShowError] = useState(false);
    const [error, setError] = useState(null);
    const [toolWaitingResponse, setToolWaitingResponse] = useState(null);
    const [approvalChangeButtons, setApprovalChangeButtons] = useState(false);
    const [visualizationIndex, setVisualizationIndex] = useState(-1);
    const [inisghtPlan, setInisghtPlan] = useState([]);
    const [insightsText, setInsightsText] = useState([]);
    const [insightsImg, setInsightsImg] = useState([]);
    const [insightsCode, setInsightsCode] = useState([]);
    const [codeIndex, setCodeIndex] = useState(-1);
    const [insightTextIndex, setInsightTextIndex] = useState(-1);
    const { data, isLoading: dbLoading, error: dbError } = useListDatabasesQuery();
    const databases = data?.data;
    useEffect(() => {
        if (databases) {
            const cubeDatabase = databases.find(database => database.is_cube === true);
            if (cubeDatabase) {
                setDBInputValue(cubeDatabase.id);
                setCompanyName(cubeDatabase.company_name)
            }
        }
    }, [databases]);

    useEffect(() => {
        setMessages([])
        setInputValue("")
        let thread_Id = generateRandomId();
        setThreadId(thread_Id)
    }, [])

    useEffect(() => {
        if (selectedMessages && selectedThreadId && selectedMessages.length > 0) {
            let visualizationIdx = 0;
            setThreadId(selectedThreadId)
            const parsedMessages = selectedMessages.flatMap((messageGroup) => {
                const messages = messageGroup.text.map(([senderType, messageText]) => ({
                    id: generateRandomId(),
                    text: messageText,
                    sender: senderType === "human" ? "user" : "server",
                    type: "text",
                    thread_id: selectedThreadId,
                }));


                for (let i = 0; i < messages.length; i++) {
                    if (messages[i].text.includes("It was executed successfully, ready for your next task")) {
                        messages[i - 1].sender = "server"
                        if (i > 0) {
                            messages[i - 1].showVisualization = true;
                            messages[i - 1].visualizationIdx = visualizationIdx;
                            messages[i - 1].showButton = false;
                            visualizationIdx++;
                        }
                    }
                }

                return messages;
            });
            setDefaultQuestion([]);
            setCard([]);
            setCardHash([]);
            setResult([])
            if (chatType == "insights" && insights.length > 0) {
                setInsightsList([])
                handleGetInsightsWithCards(insights)
            } else {
                handleGetDatasetQueryWithCards(oldCardId)
            }
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

    const openModal = (cardIndex) => {
        setSelectedIndex(cardIndex)
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setSelectedIndex(null)
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
                case "planReview":
                    await handlePlanReview(func);
                    break;
                case "getImage":
                    await handleGetImage(func);
                    break;
                case "getText":
                    await handleGetText(func);
                    break;
                case "getCode":
                    await handleGetCode(func);
                    break;
                default:
                    console.log(func);
                    break;
            }
        });
    };

    const handleGetDatasetQuery = async func => {
        const { cardId, reasoning, sources } = func.arguments;
        setSources(prevSources => [...prevSources, sources]);
        setReasoning(prevReasoning => [...prevReasoning, reasoning]);

        setId(func.arguments.cardId);
        try {
            const fetchedCard = await CardApi.get({ cardId: cardId });
            const queryCard = await CardApi.query({ cardId: cardId });
            const getDatasetQuery = fetchedCard?.dataset_query;
            const defaultQuestionTest = Question.create({
                databaseId: 1,
                name: fetchedCard.name,
                type: "query",
                display: fetchedCard.display,
                visualization_settings: {},
                dataset_query: getDatasetQuery,
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
            const hash1 = adhocQuestionHash(itemtohash);
            setResult(prevResult => Array.isArray(prevResult) ? [...prevResult, queryCard] : [queryCard]);
            setCodeQuery(prevCodeQuery => {
                const query = queryCard?.data?.native_form?.query ?? "Sorry for some reason the query was not retrieved properly";
                if (query) {
                    return Array.isArray(prevCodeQuery) ? [...prevCodeQuery, query] : [query];
                }
                return prevCodeQuery;
            });
            setDefaultQuestion(prevDefaultQuestion => Array.isArray(prevDefaultQuestion) ? [...prevDefaultQuestion, newQuestion] : [newQuestion]);
            setCard(prevCard => Array.isArray(prevCard) ? [...prevCard, fetchedCard] : [fetchedCard]);
            setCardHash(prevCardHash => Array.isArray(prevCardHash) ? [...prevCardHash, hash1] : [hash1]);
        } catch (error) {
            console.error("Error fetching card content:", error);
            setShowError(true)
            setError("There was an error fetching the dataset. Please provide feedback if this issue persists.");
        } finally {
            setIsLoading(false);
            removeLoadingMessage();
        }
    };

    const handleGetDatasetQueryWithCards = async (cardIds) => {
        setIsLoading(true);
        try {
            const fetchedCards = await Promise.all(cardIds.map(cardId => CardApi.get({ cardId })));
            const queryCards = await Promise.all(cardIds.map(cardId => CardApi.query({ cardId })));

            const newQuestions = [];
            const hashes = [];

            fetchedCards.forEach((fetchedCard, index) => {
                const getDatasetQuery = fetchedCard?.dataset_query;
                const defaultQuestionTest = Question.create({
                    databaseId: 1,
                    name: fetchedCard.name,
                    type: "query",
                    display: fetchedCard.display,
                    visualization_settings: {},
                    dataset_query: getDatasetQuery
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
                };

                const newQuestion = defaultQuestionTest.setCard(fetchedCard);
                newQuestions.push(newQuestion);

                const hash = adhocQuestionHash(itemtohash);
                hashes.push(hash);

                setResult(prevResult => [...(prevResult || []), queryCards[index]]);
            });

            setDefaultQuestion(newQuestions);
            setCard(fetchedCards);
            setCardHash(hashes);

        } catch (error) {
            console.error("Error fetching card content:", error);
            setShowError(true)
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
            const processedInsights = [];
            if (!insights || insights.length < 1) {
                console.warn('No insights provided.');
                setShowError(true);
                return;
            }

            for (const insight of insights) {
                try {
                    const fetchedCard = await CardApi.get({ cardId: insight.cardId });
                    const queryCard = await CardApi.query({ cardId: insight.cardId });
                    if (!fetchedCard || !queryCard) {
                        console.warn(`Skipping card with ID ${insight.cardId} due to missing data.`);
                        continue;
                    }
                    const getDatasetQuery = fetchedCard?.dataset_query;
                    const defaultQuestionTest = Question.create({
                        databaseId: 1,
                        name: fetchedCard.name,
                        type: "query",
                        display: fetchedCard.display,
                        visualization_settings: {},
                        dataset_query: getDatasetQuery,
                    });
                    const newQuestion = defaultQuestionTest.setCard(fetchedCard);

                    processedInsights.push({
                        insightExplanation: insight.insightExplanation,
                        card: fetchedCard,
                        queryCard: queryCard,
                        defaultQuestion: newQuestion,
                    });
                } catch (error) {
                    console.warn(`Error fetching data for card ID ${insight.cardId}:`, error);
                    continue;
                }
            }
            if (processedInsights.length > 0) {
                newInsightsList.push(processedInsights);
                setInsightsList(prevInsights => [...prevInsights, ...newInsightsList]);
            } else {
                setShowError(true)
            }

        } catch (error) {
            console.error("Error fetching card content:", error);
            setError("There was an error fetching the insights. Please provide feedback if this issue persists.");
        } finally {
            setIsLoading(false);
            removeLoadingMessage();
        }
    };

    const handleGetInsightsWithCards = async (insightsArray) => {
        try {
            const newInsightsList = [];

            for (const insights of insightsArray) {
                const processedInsights = [];
                for (const insight of insights) {
                    const fetchedCard = await CardApi.get({ cardId: insight.cardId });
                    const queryCard = await CardApi.query({ cardId: insight.cardId });
                    const getDatasetQuery = fetchedCard?.dataset_query;
                    const defaultQuestionTest = Question.create({
                        databaseId: 1,
                        name: fetchedCard.name,
                        type: "query",
                        display: fetchedCard.display,
                        visualization_settings: {},
                        dataset_query: getDatasetQuery,
                    });
                    const newQuestion = defaultQuestionTest.setCard(fetchedCard);
                    processedInsights.push({
                        insightExplanation: insight.insightExplanation,
                        card: fetchedCard,
                        queryCard: queryCard,
                        defaultQuestion: newQuestion,
                    });
                }
                newInsightsList.push(processedInsights);
            }

            setInsightsList(prevInsights => [...prevInsights, ...newInsightsList]);

        } catch (error) {
            console.error("Error fetching card content:", error);
            setShowError(true);
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

    const handlePlanReview = async func => {
        const { planReview, plan } = func.arguments;
        //Only print infoMessage
            addServerMessageWithType(
                planReview|| "Received a message from the server.",
                "text",
                "planReview"
            );
        setIsLoading(false);
        setToolWaitingResponse("planReview");
        setInisghtPlan(prevPlan => [...prevPlan, ...plan]);
        removeLoadingMessage();
    };
    
    const handleGetImage = async func => {
        const { generatedImages } = func.arguments;
        try {
            if (generatedImages && generatedImages.type === "Buffer" && Array.isArray(generatedImages.data)) {
                // Recreate the buffer using the data array (which is an array of numbers)
                const buffer = Buffer.from(generatedImages.data);
                // Convert the buffer to a Base64 string
                const base64Image = `data:image/png;base64,${buffer.toString('base64')}`;
    
                setInsightsImg(prevInsightsImg => [...prevInsightsImg, base64Image]);
            } else {
                throw new Error('Invalid image buffer format');
            }
            setVisualizationIndex(prevIndex => {
                const currentIndex = prevIndex + 1;
                addServerMessageWithType(
                    `Here is your visualization`,
                    "text",
                    "insightImg",
                    currentIndex
                );
                return currentIndex;
            });
        } catch (error) {
            console.error("Error getting image", error);
        }
    }

    const handleGetText = async func => {
        const { generatedTexts } = func.arguments;
        try {
                setInsightTextIndex(prevIndex => {
                    const currentIndex = prevIndex + 1;
                    addServerMessageWithType(
                        "Current Step:",
                        "text",
                        "insightText",
                        currentIndex
                    );
                    return currentIndex;
                });
                setInsightsText(prevInsightsText => [...prevInsightsText, generatedTexts.value]);
                setIsLoading(false);
                removeLoadingMessage();
        } catch (error) {
            console.error("Error getting text", error);
        }
    }

    const handleGetCode = async func => {
        const { generatedCodes } = func.arguments;
        try {
            setCodeIndex(prevIndex => {
                const currentIndex = prevIndex + 1;
                addServerMessageWithType(
                    `The code is as follows:`,
                    "text",
                    "insightCode",
                    currentIndex
                );
                return currentIndex;
            });
            setInsightsCode(prevCode => [...prevCode, generatedCodes]);
        } catch (error) {
            console.error("Error getting code", error);
        }
    }

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
        if (data.type === "result" && !hasError) {
            setVisualizationIndex((prevIndex) => {
                const currentIndex = prevIndex + 1;
                addServerMessageWithInfo(
                    data.message || "Received a message from the server.",
                    "text",
                    true,
                    currentIndex
                );
                return currentIndex;
            });
        } else {
            addServerMessage(
                data.message || "Received a message from the server.",
                "text",
            )
        }
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

    const addServerMessageWithInfo = (message, type, showVisualization, visualizationIdx) => {
        setMessages(prevMessages => [
            ...prevMessages,
            {
                id: Date.now() + Math.random(),
                text: message,
                sender: "server",
                type: type,
                showVisualization: showVisualization,
                visualizationIdx: visualizationIdx
            }
        ]);
    };

    const addServerMessageWithType = (message, type, visualization, visualizationIdx) => {
        setMessages(prevMessages => [
            ...prevMessages,
            {
                id: Date.now() + Math.random(),
                text: message,
                sender: "server",
                type: type,
                showType: visualization,
                visualizationIdx: visualizationIdx
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
            if(toolWaitingResponse === "planReview") {
                setMessages(prevMessages => [
                    ...prevMessages,
                    {
                        id: Date.now() + Math.random(),
                        text: "Please wait until we generate the visualization for you....",
                        sender: "server",
                        type: "text",
                        // thread_id: threadId,
                    }
                ]);
                setIsLoading(true)
            }
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
                    configData: [dbInputValue, companyName],
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
            message => message.text !== "Please wait until we generate the response...." && message.text !== "Please wait until we generate the visualization for you...."
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

            if (ws && isConnected) {
                sendMessage();
            }
        }
    }, [initialMessage, ws, isConnected]);

    useEffect(() => {
        if (initialDbName !== null && initialCompanyName !== '') {
            setDBInputValue(initialDbName)
            setCompanyName(initialCompanyName)
        }
    }, [initialDbName, initialCompanyName])


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
                {dbInputValue !== '' ? (
                    <>
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
                                card={card} defaultQuestion={defaultQuestion} result={result} openModal={openModal} insightsList={insightsList}
                                showError={showError} insightsPlan={inisghtPlan}
                                insightsText={insightsText} insightsImg={insightsImg} insightsCode={insightsCode}
                            />
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
                                        disabled={!isConnected || selectedThreadId}
                                        onClick={sendMessage}
                                        style={{
                                            position: "absolute",
                                            right: "10px",
                                            bottom: "10px",
                                            borderRadius: "8px",
                                            width: "30px",
                                            height: "30px",
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
                                        <Icon size={18} name="sendChat" style={{ paddingTop: "2px", paddingLeft: "2px" }} />
                                    </Button>
                                </div>
                            </div>


                        </div>
                    </>
                ) : (
                    <SemanticError />
                )}
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
            {isModalOpen && selectedIndex !== null && (
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
                                {sources[selectedIndex]?.tables?.map((table, index) => (
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
                                {reasoning[selectedIndex].split("\n").map((point, index) => (
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
                                <pre style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>{codeQuery[selectedIndex]}</pre>
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

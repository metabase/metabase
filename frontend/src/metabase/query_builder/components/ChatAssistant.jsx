import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon } from "metabase/ui";
import Input from "metabase/core/components/Input";
import TextArea from "metabase/core/components/TextArea";
import useWebSocket from "metabase/hooks/useWebSocket";
import ChatMessageList from "metabase/components/ChatMessageList/ChatMessageList";
import FeedbackDialog from "metabase/components/FeedbackDialog/FeedbackDialog";
import CubeRequestDialog from "metabase/components/CubeRequest/CubeRequestDialog";
import { CardApi } from "metabase/services";
import Question from "metabase-lib/v1/Question";
import { push } from "react-router-redux";
import Modal from "metabase/components/Modal";
import { Tabs } from "metabase/ui";
import { generateRandomId } from "metabase/lib/utils";
import {
    adhocQuestionHash
} from "e2e/support/helpers/e2e-ad-hoc-question-helpers";
import { clearInitialMessage } from "metabase/redux/initialMessage";
import { useSelector } from "metabase/lib/redux";
import { getDBInputValue, getCompanyName, getInsightDBInputValue } from "metabase/redux/initialDb";
import { getInitialSchema } from "metabase/redux/initialSchema";
import { useListDatabasesQuery, useGetDatabaseMetadataWithoutParamsQuery, skipToken } from "metabase/api";
import { SemanticError } from "metabase/components/ErrorPages";
import { SpinnerIcon } from "metabase/components/LoadingSpinner/LoadingSpinner.styled";


const ChatAssistant = ({ selectedMessages, selectedThreadId, setSelectedThreadId, chatType, oldCardId, insights, initial_message, setMessages, setInputValue, setThreadId, threadId, inputValue, messages, isChatHistoryOpen, setIsChatHistoryOpen, setShowButton }) => {
    const initialDbName = useSelector(getDBInputValue);
    const initialCompanyName = useSelector(getCompanyName);
    const initialSchema = useSelector(getInitialSchema);
    const initialInsightDbName = useSelector(getInsightDBInputValue);
    const inputRef = useRef(null);
    const dispatch = useDispatch();
    const assistant_url = process.env.REACT_APP_WEBSOCKET_SERVER;
    const [companyName, setCompanyName] = useState("");
    const [card, setCard] = useState(null);
    const [reasoning, setReasoning] = useState([]);
    const [sources, setSources] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(null)
    const [result, setResult] = useState([]);
    const [defaultQuestion, setDefaultQuestion] = useState([]);
    const [codeQuery, setCodeQuery] = useState([]);
    const [isDBModalOpen, setIsDBModalOpen] = useState(false);
    const [dbInputValue, setDBInputValue] = useState("");
    const [insightDbId, setInsightDbId] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTab, setSelectedTab] = useState("reasoning");
    const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
    const [isCubeRequestDialogOpen, setIsCbubeRequestDialogOpen] = useState(false);
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
    const [schema, setSchema] = useState([]);
    const [codeIndex, setCodeIndex] = useState(-1);
    const [insightTextIndex, setInsightTextIndex] = useState(-1);
    const [runId, setRunId] = useState('');
    const [codeInterpreterThreadId, setCodeInterpreterThreadId] = useState('');
    const [insightStatus, setInsightStatus] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const { data, isLoading: dbLoading, error: dbError } = useListDatabasesQuery();
    const [selectedHash, setSelectedHash] = useState(null)
    const [showCubeEditButton, setShowCubeEditButton] = useState(false)
    const [requestedFields, setRequestedFields] = useState([]);

    const databases = data?.data;
    useEffect(() => {
        if (databases) {
            const cubeDatabase = databases.find(database => database.is_cube === true);
            if (cubeDatabase) {
                setIsChatHistoryOpen(true);
                setShowButton(true);
                setDBInputValue(cubeDatabase.id);
                setCompanyName(cubeDatabase.company_name)
            }
            const insightDatabase = databases.find(
                database => database.is_cube === false,
            );
            if (insightDatabase) {
                setInsightDbId(insightDatabase.id);
            }
        }
    }, [databases]);
    const dbId = chatType === "insights" ? insightDbId : dbInputValue;
    const {
        data: databaseMetadata,
        isLoading: databaseMetadataIsLoading,
        error: databaseMetadataIsError
    } = useGetDatabaseMetadataWithoutParamsQuery(
        dbId !== "" ? { id: dbId } : skipToken
    );
    const databaseMetadataData = databaseMetadata;

    useEffect(() => {
        if (databaseMetadataData) {
            const schema = databaseMetadata.tables.map((table) => ({
                display_name: table.display_name,
                id: table.id,
                fields: table.fields.map((field) => ({
                    id: field.id,
                    name: field.name,
                    fieldName: field.display_name,
                    description: field.description,
                    details: field.fingerprint ? JSON.stringify(field.fingerprint) : null
                }))
            }));
            setSchema(schema)
        }
    }, [databaseMetadataData]);

    useEffect(() => {
        setMessages([])
        setInputValue("")
        let thread_Id = generateRandomId();
        setThreadId(thread_Id)
    }, [])

    const newChat = () => {
        setSelectedThreadId(null)
        setMessages([])
        setInputValue("")
        let thread_Id = generateRandomId();
        setThreadId(thread_Id)
    }

    useEffect(() => {
        if (selectedMessages && selectedThreadId && selectedMessages.length > 0) {
            let visualizationIdx = 0;
            setThreadId(selectedThreadId)
            const parsedMessages = selectedMessages.flatMap((messageGroup) => {
                const messages = messageGroup.text.map(([senderType, messageText]) => ({
                    id: generateRandomId(),
                    text: messageText,
                    typeMessage: "data",
                    sender: senderType === "human" ? "user" : "server",
                    type: "text",
                    isLoading: false,
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

                return messages.filter(
                    (message) =>
                        !message.text.includes("It was executed successfully, ready for your next task")
                );
            });
            setDefaultQuestion([]);
            setCard(null);
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
                    case "info":
                        await handleInfoMessage(data);
                        break;
                    case "directResponse":
                        await handleDirectResponse(data);
                        break;
                    case "plan":
                        await handlePlanMessage(data);
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

    const openModal = (cardData, cardIndex) => {
        setSelectedHash(cardData.hash)
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
            setCard(prevCard => {
                const updatedCard = {
                    ...fetchedCard, // Copy all properties from the fetched card
                    hash: hash1 // Add the hash property
                };
                return Array.isArray(prevCard) ? [...prevCard, updatedCard] : [updatedCard];
            });
            setCardHash(prevCardHash => Array.isArray(prevCardHash) ? [...prevCardHash, hash1] : [hash1]);
            console.log('CARD HASH: ', cardHash)
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
            planReview || "Received a message from the server.",
            "text",
            "planReview"
        );
        setIsLoading(false);
        setToolWaitingResponse("planReview");
        setInisghtPlan(prevPlan => [...prevPlan, ...plan]);
        removeLoadingMessage();
        // clearInfoMessage();
    };

    const handleGetImage = async func => {
        const { generatedImages, status, runId, codeInterpreterThreadId } = func.arguments;
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
            setRunId(runId)
            setCodeInterpreterThreadId(codeInterpreterThreadId)
            if (status === "completed") {
                setChatLoading(false);
                setToolWaitingResponse("continue")
            }
        } catch (error) {
            console.error("Error getting image", error);
        }
    }

    const handleGetText = async func => {
        const { generatedTexts, status, runId } = func.arguments;
        try {
            setInsightTextIndex(prevIndex => {
                const currentIndex = prevIndex + 1;
                addServerMessageWithType(
                    status === "completed" ? "Here is your final result:" : "Current Step:",
                    "text",
                    "insightText",
                    currentIndex
                );
                return currentIndex;
            });
            setInsightsText(prevInsightsText => [...prevInsightsText, generatedTexts.value]);
            setIsLoading(false);
            removeLoadingMessage();
            // clearInfoMessage();
            if (status === "completed") {
                setChatLoading(false);
                setToolWaitingResponse("continue")
            }
        } catch (error) {
            console.error("Error getting text", error);
        }
    }

    const handleGetCode = async func => {
        const { generatedCodes, status, runId, codeInterpreterThreadId } = func.arguments;
        try {
            setInsightsCode(prevCode => [...prevCode, generatedCodes]);
            setRunId(runId)
            setCodeInterpreterThreadId(codeInterpreterThreadId)
            if (status === "completed") {
                setChatLoading(false);
                setToolWaitingResponse("continue")
            }
        } catch (error) {
            console.error("Error getting code", error);
        }
    }

    const handleDefaultMessage = data => {
        if (data.message) {
            addServerMessage(
                data.message || "Received a message from the server.",
                "text",
            );
        }
    };

    const handleResultMessage = data => {
        if (data.type === "result") {
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
        setIsLoading(false);
        removeLoadingMessage();
        clearPlanMessage();
        // clearInfoMessage();
    };

    const handleInfoMessage = data => {
        removeLoadingMessage();
        clearPlanMessage();

        if (data.functions.type === "data" || data.functions.type === "error") {
            setMessages(prevMessages => {
                // Remove the last message with `isInsightData: true` or `isInsightError: true`
                const filteredMessages = [...prevMessages].reverse().filter((message, index, arr) => {
                    return !(
                        (message.isInsightData || message.isInsightError) &&
                        arr.findIndex(m => m.isInsightData || m.isInsightError) === index
                    );
                }).reverse(); // Reverse again to maintain original order

                // Prepare the new message
                const newMessage = {
                    id: Date.now() + Math.random(),
                    text: data.functions.payload.message,
                    sender: "server",
                    type: "text",
                    info: true,
                    isInsightData: data.functions.type === "data",
                    isInsightError: data.functions.type === "error"
                };

                if (data.functions.type === "error") {
                    newMessage.typeMessage = "error";
                } else {
                    newMessage.typeMessage = "data";
                }

                // Add error: true only if data.functions.payload.data.finalError exists
                if (data.functions.payload.data?.finalError) {
                    newMessage.error = true;
                }

                // Add the new message
                return [...filteredMessages, newMessage];
            });

            // Check for the specific error message format
            const message = data.functions.payload.message;
            const semanticLayerMessageStart = "To complete this task, the semantic layer needs to be updated with the following field:";
            const semanticLayerMessageEnd = "Please reach out to support for assistance.";

            if (message.startsWith(semanticLayerMessageStart) && message.endsWith(semanticLayerMessageEnd)) {
                // Extract the part of the message containing the fields
                const fieldsString = message
                    .slice(semanticLayerMessageStart.length, message.indexOf(semanticLayerMessageEnd))
                    .trim();

                // Split the string into an array of field names
                const requestedFields = fieldsString.split(',').map(field => field.trim());

                console.log('Extracted fields:', requestedFields);

                // You can now use or store the `requestedFields` array in your component
                // For example, set it in the state
                setRequestedFields(requestedFields); // Assuming you have a state for requestedFields
            }
        }
    };


    const handleDirectResponse = data => {
        addServerMessage(
            data.message || "Received a message from the server.",
            "text",
        );
        setIsLoading(false);
        removeLoadingMessage();
    }

    const handlePlanMessage = data => {
        removeLoadingMessage();
        if (data.message) {
            setMessages(prevMessages => [
                ...prevMessages,
                {
                    id: Date.now() + Math.random(),
                    text: data.message,
                    sender: "server",
                    type: "text",
                    plan: true
                }
            ]);
        }
    }

    const redirect = async () => {
        if (selectedHash) {
            dispatch(push(`/question#${selectedHash}`));
            const deletedCard = await CardApi.delete({ id: id });
        }
    }

    const addServerMessage = (message, type) => {
        setMessages(prevMessages => [
            ...prevMessages,
            {
                id: Date.now() + Math.random(),
                text: message,
                typeMessage: "data",
                sender: "server",
                type: type,
            }
        ]);
    };

    const addServerMessageWithInfo = (message, type, showVisualization, visualizationIdx) => {
        if (message === "The semantic layer requires an update to proceed with the task.") {
            setShowCubeEditButton(true)
            return;
        }
        setMessages(prevMessages => [
            ...prevMessages,
            {
                id: Date.now() + Math.random(),
                text: message,
                typeMessage: "data",
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
                typeMessage: "data",
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
                    typeMessage: "data",
                    sender: "user",
                    type: "text",
                    thread_id: threadId,
                }
            ]);
            if (toolWaitingResponse === "planReview") {
                setMessages(prevMessages => [
                    ...prevMessages,
                    {
                        id: Date.now() + Math.random(),
                        text: "Please wait until we generate the visualization for you....",
                        typeMessage: "data",
                        sender: "server",
                        type: "text",
                        // thread_id: threadId,
                    }
                ]);
                setIsLoading(true)
                setChatLoading(true);
            }
            if (toolWaitingResponse === "continue") {
                setMessages(prevMessages => [
                    ...prevMessages,
                    {
                        id: Date.now() + Math.random(),
                        text: "Please wait until we generate the response....",
                        typeMessage: "data",
                        sender: "server",
                        type: "text"
                    }
                ]);
                setIsLoading(true)
                setChatLoading(true);
                const response = {
                    type: "query",
                    task: inputValue,
                    thread_id: threadId,
                    appType: chatType,
                };
                ws && ws.send(JSON.stringify(response));
            } else {
                ws.send(
                    JSON.stringify({
                        type: "toolResponse",
                        response: {
                            function_name: toolWaitingResponse,
                            response: JSON.stringify(inputValue),
                        },
                    })
                );
            }
            setToolWaitingResponse(null);
            setInputValue("");
            return;
        }


        setIsLoading(true);
        const dbId = chatType === "insights" ? insightDbId : dbInputValue;
        if (isConnected) {
            ws.send(
                JSON.stringify({
                    type: "configure",
                    configData: [dbId, companyName],
                    appType: chatType,
                    schema: schema
                }),
            );
        }
        setMessages(prevMessages => [
            ...prevMessages,

            {
                id: Date.now() + Math.random(),
                text: inputValue,
                typeMessage: "data",
                sender: "user",
                type: "text",
                thread_id: threadId,
            },
            {
                id: Date.now() + Math.random(),
                text: "Please wait until we generate the response....",
                typeMessage: "data",
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
        }
        setInputValue("");
        dispatch(clearInitialMessage())
    };

    const removeLoadingMessage = () => {
        setMessages(prevMessages => prevMessages.filter(
            message => message.text !== "Please wait until we generate the response...." && message.text !== "Please wait until we generate the visualization for you...."
        ));
    };

    const clearPlanMessage = () => {
        setMessages(prevMessages => prevMessages.filter(
            message => !message.plan
        ));
    }

    const clearInfoMessage = () => {
        setMessages(prevMessages => prevMessages.filter(
            message => !message.info
        ));
    }

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

    const handleCubeRequestDialogOpen = () => {
        setIsCbubeRequestDialogOpen(!isCubeRequestDialogOpen);
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

    const stopStream = async () => {
        const thread_id = codeInterpreterThreadId;
        const run_id = runId;
        ws.send(
            JSON.stringify({
                type: "stopStreaming",
                data: {
                    codeInterpreterThreadId: thread_id,
                    runId: run_id,
                },
            })
        );
        setRunId('');
        setCodeInterpreterThreadId('');
        setChatLoading(false);
    };

    const stopMessage = async () => {
        if (runId && codeInterpreterThreadId) {
            await stopStream();
        }
    }

    useEffect(() => {
        if (initial_message.message) {
            setInputValue(initial_message.message);

            if (ws && isConnected) {
                sendMessage();
            }
        }
    }, [initial_message, ws, isConnected]);

    useEffect(() => {
        if (initialDbName !== null && initialInsightDbName !== null && initialCompanyName !== '' && initialSchema && initialSchema.schema && initialSchema.schema.length > 0) {
            setShowButton(true);
            setIsChatHistoryOpen(true);
            setDBInputValue(initialDbName)
            setInsightDbId(initialInsightDbName)
            setCompanyName(initialCompanyName)
            setSchema(initialSchema.schema)
        }
    }, [initialDbName, initialInsightDbName, initialCompanyName, initialSchema])


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
                {chatType === "default" && dbInputValue === '' ? (
                    <SemanticError />
                ) : (
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
                                insightsText={insightsText} insightsImg={insightsImg} insightsCode={insightsCode} showCubeEditButton={showCubeEditButton} sendAdminRequest={handleCubeRequestDialogOpen}
                            />
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "center", // Center horizontally
                                    width: "100%",            // Take full width
                                    maxWidth: `calc(100% - ${isChatHistoryOpen ? "600px" : "300px"})`, // Adjust the width based on the chat history visibility
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
                                        height: `${selectedThreadId ? "70px" : ""}`,
                                        padding: "8px",
                                        border: "1px solid #E0E0E0",
                                        borderRadius: "8px",
                                        backgroundColor: "#F8FAFD",
                                        position: "relative", // Important for absolute positioning inside this div
                                    }}
                                >
                                    {!selectedThreadId ? (
                                        <>
                                            <TextArea
                                                ref={inputRef}
                                                value={inputValue}
                                                onChange={handleInputChange}
                                                disabled={!isConnected || schema.length < 1 || selectedThreadId}
                                                onKeyPress={handleKeyPress}
                                                placeholder={t`Enter a prompt here...`}
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
                                                disabled={!isConnected || schema.length < 1 || selectedThreadId}
                                                onClick={chatLoading ? stopMessage : sendMessage}
                                                style={{
                                                    position: "absolute",
                                                    right: "10px",
                                                    bottom: "10px",
                                                    borderRadius: "8px",
                                                    width: "30px",
                                                    height: "30px",
                                                    padding: "0",
                                                    minWidth: "0",
                                                    backgroundColor: isConnected && schema.length > 0 ? "#8A64DF" : "#F1EBFF",
                                                    color: "#FFF",
                                                    border: "none",
                                                    cursor: isConnected && schema.length > 0 ? "pointer" : "not-allowed",
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                }}
                                            >
                                                {chatLoading ? (
                                                    <SpinnerIcon
                                                        iconSize={18}
                                                        borderWidth={2}
                                                    />
                                                ) : (
                                                    <Icon size={18} name="sendChat" style={{ paddingTop: "2px", paddingLeft: "2px" }} />
                                                )}
                                            </Button>
                                        </>

                                    ) : (
                                        <Button
                                            variant="filled"
                                            disabled={!isConnected}
                                            onClick={newChat}
                                            style={{
                                                position: "absolute",
                                                right: "10px",
                                                bottom: "10px",
                                                borderRadius: "8px",
                                                width: "200px",
                                                height: "50px",
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
                                            Generate new chat
                                        </Button>
                                    )}

                                </div>
                            </div>


                        </div>
                    </>
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
            <CubeRequestDialog
                isOpen={isCubeRequestDialogOpen}
                onClose={handleCubeRequestDialogOpen}
                messages={messages}
                requestedFields={requestedFields}

            />
        </>
    );
};

export default ChatAssistant;

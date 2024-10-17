import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon } from "metabase/ui";
import Input from "metabase/core/components/Input";
import TextArea from "metabase/core/components/TextArea";
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
import { useSelector } from "metabase/lib/redux";
import { getDBInputValue, getCompanyName, getInsightDBInputValue } from "metabase/redux/initialDb";
import { getInitialSchema, getInitialInsightSchema } from "metabase/redux/initialSchema";
import { useListDatabasesQuery, useGetDatabaseMetadataWithoutParamsQuery, skipToken } from "metabase/api";
import { SemanticError } from "metabase/components/ErrorPages";
import { SpinnerIcon } from "metabase/components/LoadingSpinner/LoadingSpinner.styled";
import { t } from "ttag";


const ChatAssistant = ({ client, selectedMessages, selectedThreadId, setSelectedThreadId, chatType, oldCardId, insights, initial_message, setMessages, setInputValue, setThreadId, threadId, inputValue, messages, isChatHistoryOpen, setIsChatHistoryOpen, setShowButton, setShouldRefetchHistory }) => {
    const initialDbName = useSelector(getDBInputValue);
    const initialCompanyName = useSelector(getCompanyName);
    const initialSchema = useSelector(getInitialSchema);
    const initialInsightDbName = useSelector(getInsightDBInputValue);
    const initialInsightSchema = useSelector(getInitialInsightSchema)
    const inputRef = useRef(null);
    const dispatch = useDispatch();
    const [agent, setAgent] = useState(null);    // For managing the Assistant Agent
    const [thread, setThread] = useState(null);  // To store the created thread
    const [companyName, setCompanyName] = useState("");
    const [card, setCard] = useState([]);
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
    const [isCubeRequestDialogOpen, setIsCbubeRequestDialogOpen] = useState(false);
    const [cardHash, setCardHash] = useState([]);
    const [id, setId] = useState(0);
    const [showError, setShowError] = useState(false);
    const [error, setError] = useState(null);
    const [approvalChangeButtons, setApprovalChangeButtons] = useState(false);
    const [visualizationIndex, setVisualizationIndex] = useState(-1);
    const [inisghtPlan, setInisghtPlan] = useState([]);
    const [insightCellCode, setInsightCellCode] = useState([]);
    const [insightsCode, setInsightsCode] = useState([]);
    const [insightsImg, setInsightsImg] = useState([]);
    const [progressShow, setProgressShow] = useState(false);
    const [insightsText, setInsightsText] = useState([]);
    const [finalMessages, setFinalMessages] = useState([]);
    const [finalMessagesText, setFinalMessagesText] = useState([]);
    const [runId, setRunId] = useState('');
    const [codeInterpreterThreadId, setCodeInterpreterThreadId] = useState('');
    const [schema, setSchema] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const { data, isLoading: dbLoading, error: dbError } = useListDatabasesQuery();
    const [selectedHash, setSelectedHash] = useState(null)
    const [showCubeEditButton, setShowCubeEditButton] = useState(false)
    const [requestedFields, setRequestedFields] = useState([]);
    const [pendingInfoMessage, setPendingInfoMessage] = useState(null);
    const [insightDB, setInsightDB] = useState(null);
    const [chatDisabled, setChatDisabled] = useState(false);

    const databases = data?.data;
    useEffect(() => {
        if (databases) {
            const cubeDatabase = databases.find(database => database.is_cube === true);
            const rawDatabase = databases.find(database => database.is_cube === false);
            if (cubeDatabase) {
                setIsChatHistoryOpen(true);
                setShowButton(true);
                setDBInputValue(cubeDatabase.id);
                setCompanyName(cubeDatabase.company_name)
            }
            if (rawDatabase) {
                setInsightDB(rawDatabase.id);
            }
        }
    }, [databases]);

    const {
        data: databaseMetadata,
        isLoading: databaseMetadataIsLoading,
        error: databaseMetadataIsError
    } = useGetDatabaseMetadataWithoutParamsQuery(
        dbInputValue !== "" ? { id: dbInputValue } : skipToken
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

    // Initialize Client and Thread only once when component mounts
    useEffect(() => {
        const initializeClientAndThread = async () => {
            try {


                // Search for assistants
                const assistants = await client.assistants.search({ metadata: null, limit: 10, offset: 0 });
                let selectedAgent = assistants[0];
                for (let i = 0; i < assistants.length; i++) {
                    if (
                        (chatType === 'insights' && assistants[i].name === 'get_insight_agent') ||
                        (chatType !== 'insights' && assistants[i].name === 'get_data_agent')
                    ) {
                        selectedAgent = assistants[i];
                        break;
                    }
                }
                setAgent(selectedAgent);

                // Create a new thread
                const createdThread = await client.threads.create();
                setThread(createdThread);
            } catch (error) {
                console.error("Error initializing Client or creating thread:", error.message);
            }
        };

        initializeClientAndThread();
    }, []);


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
        if (client && selectedMessages && selectedThreadId && selectedMessages.length > 0) {
            // Clear existing messages
            setMessages([]);
            let visualizationIdx = 0;
            setThreadId(selectedThreadId);

            const processMessages = async () => {
                let newMessages = [];

                // Step 1: Loop through the messages and find the one with the card_id
                for (let i = 0; i < selectedMessages.length; i++) {
                    const message = selectedMessages[i];
                    const senderType = message.type === "human" ? "user" : "server";

                    // Step 2: Check if this message contains the card_id
                    let card_id = null;
                    try {
                        const parsedContent = JSON.parse(message.content);
                        if (parsedContent.card_id) {
                            card_id = parsedContent.card_id;
                        }
                    } catch (error) {
                        // If it's not a valid JSON, just continue to add the message
                    }

                    // Step 3: If the message contains a card_id, skip rendering it but handle visualization
                    if (card_id) {
                        // Generate the visualization for the card
                        await handleGetDatasetQuery(card_id);

                        // Add a visualization message to the list (this replaces the card_id message)
                        const visualizationMessage = {
                            id: Date.now() + Math.random(),
                            sender: "server",
                            text: "", // Visualizations typically don’t need text
                            showVisualization: true,
                            visualizationIdx,
                            isLoading: false,
                        };

                        // Add the visualization message in place of the card_id message
                        newMessages.push(visualizationMessage);

                        // Skip the card_id message (don't add it to newMessages)
                        continue;
                    }

                    // Step 4: Add the regular messages (not the card_id message)
                    const newMessageObj = {
                        id: generateRandomId(),
                        text: message.content,
                        typeMessage: "data",
                        sender: senderType,
                        type: "text",
                        isLoading: false,
                        thread_id: selectedThreadId,
                    };

                    // Add the regular message to the list
                    newMessages.push(newMessageObj);
                }

                // Step 5: After processing all messages, update the state
                setMessages((prev) => [...prev, ...newMessages]);
            };

            // Call the processMessages function to handle the logic
            processMessages();
        }
    }, [client, selectedMessages, selectedThreadId]);



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

    const openModal = (cardData, cardIndex) => {
        setSelectedHash(cardData.hash)
        setSelectedIndex(cardIndex)
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setSelectedIndex(null)
        setIsModalOpen(false);
    };


    const handleGetDatasetQuery = async (cardId) => {
        try {
            setIsLoading(true); // Show loading state
            
            // Fetch the card details using the provided cardId
            const fetchedCard = await CardApi.get({ cardId });
            const queryCard = await CardApi.query({ cardId });
            const getDatasetQuery = fetchedCard?.dataset_query;
    
            if (!getDatasetQuery) {
                throw new Error("No dataset query found for this card.");
            }
    
            // Create a new question object based on the fetched card's dataset query
            const newQuestion = Question.create({
                databaseId: getDatasetQuery.database,
                name: fetchedCard.name,
                type: "query",
                display: fetchedCard.display,
                visualization_settings: {},
                dataset_query: getDatasetQuery,
            });
    
            // Generate a unique hash for this question
            const itemToHash = {
                dataset_query: {
                    database: getDatasetQuery.database,
                    type: "query",
                    query: getDatasetQuery.query,
                },
                display: fetchedCard.display,
                visualization_settings: {},
                type: "question",
            };
            const hash = adhocQuestionHash(itemToHash);
    
            // Append new values safely by ensuring prevCard is always an array
            setCard((prevCard) => Array.isArray(prevCard) ? [...prevCard, { ...fetchedCard, hash }] : [{ ...fetchedCard, hash }]);
            setDefaultQuestion((prevDefaultQuestion) => Array.isArray(prevDefaultQuestion) ? [...prevDefaultQuestion, newQuestion] : [newQuestion]);
            setResult((prevResult) => Array.isArray(prevResult) ? [...prevResult, queryCard] : [queryCard]);
            setCardHash((prevCardHash) => Array.isArray(prevCardHash) ? [...prevCardHash, hash] : [hash]);
    
            // Handle code query if needed
            setCodeQuery((prevCodeQuery) => {
                const query = queryCard?.data?.native_form?.query ?? "Sorry, query was not retrieved properly.";
                return Array.isArray(prevCodeQuery) ? [...prevCodeQuery, query] : [query];
            });
    
        } catch (error) {
            console.error("Error fetching card content:", error);
            setShowError(true);
            setError("There was an error fetching the dataset. Please provide feedback if this issue persists.");
        } finally {
            setIsLoading(false);
        }
    };
    
    

    useEffect(() => {
        if (pendingInfoMessage && visualizationIndex >= 0) {
            setMessages(prevMessages => {
                const newMessage = {
                    id: Date.now() + Math.random(),
                    text: pendingInfoMessage,
                    sender: "server",
                    type: "text",
                    info: true,
                    isInsightData: false,
                    isInsightError: true,
                    typeMessage: "error",
                };

                return [...prevMessages, newMessage];
            });

            setPendingInfoMessage(null);
        }
    }, [pendingInfoMessage, visualizationIndex, setMessages]);

    const redirect = async () => {
        if (selectedHash) {
            dispatch(push(`/question#${selectedHash}`));
            const deletedCard = await CardApi.delete({ id: id });
        }
    }

    const sendMessage = async () => {
        if (!inputValue.trim() || !client || !agent || !thread) return;
    
        setIsLoading(true);  // Set loading to true when the message is sent
        let visualizationIdx = messages.filter((msg) => msg.showVisualization).length;
    
        // Prepare the user message to be sent
        let messagesToSend = [{ role: "human", content: inputValue }];
        const userMessage = {
            id: Date.now() + Math.random(),
            sender: "user",
            text: inputValue,
            visualizationIdx,
            showVisualization: false,
            isLoading: true,
        };
    
        // Display temporary message during server response wait time
        const tempMessageId = Date.now() + Math.random();
        let tempMessage;
    
        if (chatType !== 'insights') {
            tempMessage = {
                id: tempMessageId,
                sender: "server",
                text: "", // This will be updated with the actual content from the response chunks
                isLoading: true,
                isTemporary: true, // Marking as a temporary message
            };
    
            // Append the user message and the temporary server message to the state
            setMessages((prev) => [...prev, userMessage, tempMessage]);
    
            // Call emulateDataStream to show a waiting message while we fetch the first chunk
            emulateDataStream(50, tempMessageId);
        } else {
            tempMessage = {
                id: Date.now() + Math.random(),
                text: "Please wait until we generate the response....",
                typeMessage: "data",
                sender: "server",
                type: "text",
                isLoading: true,
            };
            setMessages((prev) => [...prev, userMessage, tempMessage]);
        }
    
        // Clear the input field
        setInputValue("");
        setChatDisabled(true);
        setChatLoading(true);
        let currentMessage = ""; // To accumulate partial chunks
        let isNewMessage = true; // Flag to track new message status
        let lastMessageId = tempMessageId; // Track last message to update its loading state
        let cardGenerated = false; // Track if the card has been generated
        let finalMessageProcessed = false; // Track if the final message has been appended
    
        try {
            const schema = chatType === 'insights' ? initialInsightSchema : initialSchema.schema;
            const databaseID = chatType === 'insights' ? initialInsightDbName : initialDbName;
            const streamResponse = client.runs.stream(thread.thread_id, agent.assistant_id, {
                input: { messages: messagesToSend, company_name: initialCompanyName, database_id: databaseID, schema: schema },
                config: { recursion_limit: 25 },
                streamMode: "messages",
            });
    
            for await (const chunk of streamResponse) {
                const { event, data } = chunk;
    
                // Handle partial messages
                if (event === "messages/partial" && data.length > 0) {
                    const messageData = data[0];
                    const { content, type, tool_calls, response_metadata } = messageData;
    
                    if (messageData && messageData.content) {
                        const partialText = messageData.content; // Current text chunk
    
                        // Check if the current chunk contains the previous message or it's a new message
                        if (chatType !== 'insights') {
                            if (isNewMessage || !partialText.startsWith(currentMessage)) {
                                // New message stream detected, append a new temporary message
                                const newTempMessageId = Date.now() + Math.random();
                                const newTempMessage = {
                                    id: newTempMessageId,
                                    sender: "server",
                                    text: partialText, // Use partial chunk text
                                    isLoading: true,
                                    isTemporary: true,
                                };
                                setMessages((prev) => [...prev, newTempMessage]);
    
                                // Set flag to false after first chunk of the new message
                                isNewMessage = false;
                                lastMessageId = newTempMessageId;  // Track the new message ID
                            } else {
                                // Replace the last message with the new chunk if it's a continuation
                                setMessages((prev) => {
                                    const updatedMessages = [...prev];
                                    const lastMessageIndex = updatedMessages.findIndex(msg => msg.id === lastMessageId);
    
                                    // Replace text of the last message with the new partial content
                                    if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].isTemporary) {
                                        updatedMessages[lastMessageIndex].text = partialText; // Replace with the full message
                                    }
                                    return updatedMessages;
                                });
                            }
                        } else {
                            setFinalMessages((prevText) => {
                                const updatedText = [...prevText];
                                const lastMessage = updatedText[updatedText.length - 1];
                                if (lastMessage && lastMessage.sender === 'server') {
                                    // Update the text of the last message if it's from the server
                                    updatedText[updatedText.length - 1].text = typeof content === 'string' ? content : JSON.stringify(content);
                                } else {
                                    // Add a new message from the server if the last one wasn't from the server
                                    updatedText.push({
                                        id: Date.now() + Math.random(),
                                        sender: "server",
                                        text: typeof content === 'string' ? content : JSON.stringify(content),
                                    });
                                }
                                return updatedText;
                            });
                        }
    
                        // Store the current message to ensure the final text is updated correctly
                        currentMessage = partialText;
                    }
    
                    // Handle tool calls (like card generation)
                    if (tool_calls.length > 0 && response_metadata && response_metadata.finish_reason === 'stop') {
                        if (tool_calls[0].name === "IdentifyFieldsOutput") {
                            const { table_names } = tool_calls[0].args;
                        } else if (tool_calls[0].name === "CreatePlanOutput") {
                            const { steps } = tool_calls[0].args;
                            removeExistingMessage("Please wait until we generate the response....");
                            setMessages(prevMessages => [
                                ...prevMessages,
                                {
                                    id: Date.now() + Math.random(),
                                    text: "Here is a plan on how we want to get insights for your task.",
                                    typeMessage: "data",
                                    sender: "server",
                                    showType: "insightProgress",
                                }
                            ]);
                            setInisghtPlan(steps);
                            setProgressShow(true);
                        } else if (tool_calls[0].name === "GenerateCardOutput") {
                            const { card_id } = tool_calls[0].args;
    
                            const cardMessageId = Date.now() + Math.random();
                            const cardTempMessage = {
                                id: cardMessageId,
                                sender: "server",
                                text: "Generating card...", // Show progress text
                                isLoading: true,
                                isTemporary: true,
                            };
    
                            // Append the card generation message
                            setMessages((prev) => [...prev, cardTempMessage]);
    
                            // Show the card generation progress message
                            showCardGenerationMessage(50, cardMessageId);
    
                            // Fetch the dataset and show visualization
                            await handleGetDatasetQuery(card_id);
    
                            setMessages((prev) => {
                                const visualizationMessage = {
                                    id: Date.now() + Math.random(),
                                    sender: "server",
                                    text: "", // Visualizations typically don’t have text
                                    showVisualization: true,
                                    visualizationIdx,
                                    isLoading: false,
                                };
    
                                return [...prev, visualizationMessage]; // Append visualization message without removing others
                            });
    
                            cardGenerated = true;
                        }
                    }
                }
    
                // Handle complete messages
                if (event === "messages/complete" && data.length > 0) {
                    setFinalMessages((prevFinalMessages) => {
                        const lastMessage = prevFinalMessages[prevFinalMessages.length - 1]?.text || '';
                        // Use the last message (chunk) to update finalMessagesText
                        const lastChunk = lastMessage;
                        // Update finalMessagesText after processing
                        setFinalMessagesText((prevFinalMessagesText) => [
                            ...prevFinalMessagesText,
                            lastChunk,
                        ]);
    
                        return prevFinalMessages;
                    });
                    const messageData = data[0];
    
                    // Handle tool type messages
                    if (messageData && messageData.type === "tool") {
                        try {
                            const parsedContent = JSON.parse(messageData.content);
                            const { card_id, explanation, python_code, result } = parsedContent;
    
                            if (card_id) {
                                const cardMessageId = Date.now() + Math.random();
                                const cardTempMessage = {
                                    id: cardMessageId,
                                    sender: "server",
                                    text: "Generating card...", // Show progress text
                                    isLoading: true,
                                    isTemporary: true,
                                };
    
                                // Append the card generation message
                                setMessages((prev) => [...prev, cardTempMessage]);
    
                                // Fetch the dataset and append the card
                                await handleGetDatasetQuery(card_id);
    
                                setMessages((prev) => {
                                    const visualizationMessage = {
                                        id: Date.now() + Math.random(),
                                        sender: "server",
                                        text: "", // Visualizations typically don’t have text
                                        showVisualization: true,
                                        visualizationIdx,
                                        isLoading: false,
                                    };
    
                                    return [...prev, visualizationMessage];
                                });
    
                                cardGenerated = true;
                            }
    
                            if (python_code && explanation) {
                                removeExistingMessage("Please wait until we generate the response....")
                                setInsightCellCode((prevCode) => [...prevCode, python_code]);
                                setInsightsText((prevText) => [...prevText, explanation]);
                                setInsightsCode((prevCode) => [...prevCode, python_code]);
                            }
    
                            if (result && result.outputs && result.outputs.length > 0) {
                                removeExistingMessage("Please wait until we generate the response....")
                                result.outputs.forEach((output) => {
                                    if (output.data && output.data['image/png']) {
                                        const generatedImages = output.data['image/png'];
                                        const base64Image = `data:image/png;base64,${generatedImages}`;
                                        setInsightsImg((prevInsightsImg) => [...prevInsightsImg, base64Image]);
                                    }
                                    if (output.data && output.data['text/plain']) {
                                        const plainText = output.data['text/plain'];
                                        if (!plainText.includes('<Figure size') && !plainText.includes('Axes>')) {
                                            setFinalMessagesText((prevText) => [...prevText, plainText]);
                                        }
                                    }
                                });
                            }
                        } catch (error) {
                            console.error("Error parsing tool message content:", error);
                        }
                    } else if (messageData && typeof messageData.content === 'string' && !finalMessageProcessed) {
                        // Avoid duplication by ensuring the final message is only appended once
                        finalMessageProcessed = true;
    
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: Date.now() + Math.random(),
                                sender: "server",
                                text: messageData.content, // Complete message content
                                isLoading: false,
                                showVisualization: false,
                                completedAfterCard: cardGenerated, // Flag to show it came after card generation
                            },
                        ]);
    
                        // Reset the state for the next message
                        currentMessage = "";
                        isNewMessage = true;
                    }
                }

                if (event === "error" && data) {
                    removeExistingMessage("Please wait until we generate the response....")
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: Date.now() + Math.random(),
                            sender: "server",
                            text: "There was an error processing your request. Please contact team Omniloy for assistance.",
                            typeMessage: 'error',
                            isLoading: false,
                            showVisualization: false,
                            showSuggestionButton: false
                        },
                    ])
                }
            }
                setChatDisabled(false);
                setChatLoading(false);
        } catch (error) {
            setChatDisabled(false);
            setChatLoading(false);
            console.error("Error during message processing:", error.message);
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now() + Math.random(),
                    sender: "server",
                    text: "An error occurred while processing your request. Please try again later.",
                    isLoading: false,
                    showVisualization: false
                },
                {
                    id: Date.now() + Math.random(),
                    sender: "server",
                    text: error.message,
                    isLoading: false,
                    showVisualization: false
                },
            ]);
        }finally {
            setChatDisabled(false);
            setChatLoading(false);
            setShouldRefetchHistory(true);
            setMessages((prev) =>
                prev.map((msg) => ({
                    ...msg,
                    isLoading: false, // Set all messages' isLoading to false
                }))
            );
            setIsLoading(false);  // Ensure loading is turned off when the process finishes
        }
    };
    



    function showCardGenerationMessage(chunkInterval = 50, tempMessageId) {
        const messages = [
            "Fetching the data from your database to generate the card...",
            "Working with your database to gather the necessary information...",
            "Generating the card with the requested data, please hold on for a moment...",
            "Querying your database and preparing the card with all relevant insights...",
            "The data is being processed and your card will be visible shortly..."
        ];

        const startTime = Date.now();

        function chunkString(str, chunkSize) {
            const chunks = [];
            for (let i = 0; i < str.length; i += chunkSize) {
                chunks.push(str.slice(i, i + chunkSize));
            }
            return chunks;
        }

        function getRandomMessage() {
            return messages[Math.floor(Math.random() * messages.length)];
        }

        function simulateTyping(message, index = 0) {
            const chunks = chunkString(message, 5); // Chunk size of 5 characters

            if (index < chunks.length) {
                setMessages((prev) => {
                    return prev.map((msg) =>
                        msg.id === tempMessageId
                            ? {
                                ...msg,
                                text: msg.text + chunks[index], // Append chunks of text
                            }
                            : msg
                    );
                });
                setTimeout(() => simulateTyping(message, index + 1), chunkInterval);
            }
        }

        const selectedMessage = getRandomMessage();
        simulateTyping(selectedMessage);
    }

    // Updated emulateDataStream to integrate with chat messages
    function emulateDataStream(chunkInterval = 50, tempMessageId) {
        const messages = [
            "Scanning through your card collection and analyzing relevant tables...",
            "Identifying patterns in the data and cross-referencing cards with table structures...",
            "Exploring relationships between request and cards and extracting key metrics from tables...",
            "Mapping relevant cards and corresponding table columns for comprehensive analysis...",
            "Evaluating the semantic connections between cards and their associated table data...",
        ];

        const startTime = Date.now();

        function chunkString(str, chunkSize) {
            const chunks = [];
            for (let i = 0; i < str.length; i += chunkSize) {
                chunks.push(str.slice(i, i + chunkSize));
            }
            return chunks;
        }

        function getRandomMessage() {
            return messages[Math.floor(Math.random() * messages.length)];
        }

        function simulateTyping(message, index = 0) {
            const chunks = chunkString(message, 5); // Chunk size of 5 characters

            if (index < chunks.length) {
                setMessages((prev) => {
                    return prev.map((msg) =>
                        msg.id === tempMessageId
                            ? {
                                ...msg,
                                text: msg.text + chunks[index], // Append chunks of text
                            }
                            : msg
                    );
                });
                setTimeout(() => simulateTyping(message, index + 1), chunkInterval);
            }
        }

        const selectedMessage = getRandomMessage();
        simulateTyping(selectedMessage);
    }


    const handleSuggestion = () => {
        // setMessages(prevMessages => [
        //     ...prevMessages,
        //     {
        //         id: Date.now() + Math.random(),
        //         text: suggestionQuestion,
        //         typeMessage: "data",
        //         sender: "user",
        //         type: "text",
        //         // thread_id: threadId,
        //     }
        // ]);
        // const response = {
        //     type: "query",
        //     task: suggestionQuestion,
        //     thread_id: threadId,
        //     appType: chatType,
        // };
        // ws && ws.send(JSON.stringify(response));
    }
    const removeLoadingMessage = () => {
        setMessages(prevMessages => prevMessages.filter(
            message => message.text !== "Please wait until we generate the response...." && message.text !== "Please wait until we generate the visualization for you...."
        ));
    };

    const removeExistingMessage = (messageContent) => {
        setMessages(prevMessages =>
            prevMessages.filter(message => message.text !== messageContent)
        );
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

    const handleCubeRequestDialogOpen = () => {
        setIsCbubeRequestDialogOpen(!isCubeRequestDialogOpen);
    };

    const handleAccept = () => {
        // ws.send(
        //     JSON.stringify({
        //         type: "toolResponse",
        //         response: {
        //             function_name: toolWaitingResponse,
        //             response: "true",
        //         },
        //     })
        // );
        // setApprovalChangeButtons(false);
    };

    const handleDeny = () => {
        // ws.send(
        //     JSON.stringify({
        //         type: "toolResponse",
        //         response: {
        //             function_name: toolWaitingResponse,
        //             response: "false",
        //         },
        //     })
        // );
        // setApprovalChangeButtons(false);
    };

    const stopStream = async () => {
        // const thread_id = codeInterpreterThreadId;
        // const run_id = runId;
        // ws.send(
        //     JSON.stringify({
        //         type: "stopStreaming",
        //         data: {
        //             codeInterpreterThreadId: thread_id,
        //             runId: run_id,
        //         },
        //     })
        // );
        // setRunId('');
        // setCodeInterpreterThreadId('');
        // setChatLoading(false);
    };

    const stopMessage = async () => {
        if (runId && codeInterpreterThreadId) {
            await stopStream();
        }
    }

    useEffect(() => {
        if (initial_message.message) {
            setInputValue(initial_message.message);
            if (client, agent, thread) {
                sendMessage();
            }

        }
    }, [initial_message, client, agent, thread]);

    useEffect(() => {
        if (initialDbName !== null && initialCompanyName !== '' && initialSchema && initialSchema.schema && initialSchema.schema.length > 0) {
            setShowButton(true);
            setIsChatHistoryOpen(true);
            setDBInputValue(initialDbName)
            setCompanyName(initialCompanyName)
            setSchema(initialSchema.schema)
        }
    }, [initialDbName, initialCompanyName, initialSchema])

    // useEffect(() => {
    //     if (toolWaitingResponse === "identifyRelevantTables" || toolWaitingResponse === "generateCode" || toolWaitingResponse === "identifyingTablesDone") {
    //         ws.send(
    //             JSON.stringify({
    //                 type: "toolResponse",
    //                 response: {
    //                     function_name: toolWaitingResponse,
    //                     response: "OK",
    //                 },
    //             })
    //         );
    //         setToolWaitingResponse(null);
    //     }
    // }, [toolWaitingResponse])

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
                                card={card} defaultQuestion={defaultQuestion} result={result} openModal={openModal}
                                showError={showError} insightsCode={insightsCode} showCubeEditButton={showCubeEditButton} sendAdminRequest={handleCubeRequestDialogOpen} onSuggestion={handleSuggestion}
                                insightCellCode={insightCellCode} insightsImg={insightsImg} insightsPlan={inisghtPlan} progressShow={progressShow}
                                insightsText={insightsText} finalMessages={finalMessages} finalMessagesText={finalMessagesText}
                            />
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "center", // Center horizontally
                                    width: "100%",            // Take full width
                                    maxWidth: `calc(100% - ${isChatHistoryOpen ? "800px" : "500px"})`, // Adjust the width based on the chat history visibility
                                    backgroundColor: "#FFF",
                                    position: "fixed",
                                    bottom: "5rem"
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
                                                disabled={!client || chatLoading || schema.length < 1 || selectedThreadId || chatDisabled}
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
                                                disabled={!client || schema.length < 1 || selectedThreadId || chatDisabled}
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
                                                    backgroundColor: client && schema.length > 0 ? "#8A64DF" : "#F1EBFF",
                                                    color: "#FFF",
                                                    border: "none",
                                                    cursor: client && schema.length > 0 ? "pointer" : "not-allowed",
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
                                            disabled={!client}
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
                                                backgroundColor: client ? "#8A64DF" : "#F1EBFF",
                                                color: "#FFF",
                                                border: "none",
                                                cursor: client ? "pointer" : "not-allowed",
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
                                Reasoning
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

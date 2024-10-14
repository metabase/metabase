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
import { getInitialSchema } from "metabase/redux/initialSchema";
import { useListDatabasesQuery, useGetDatabaseMetadataWithoutParamsQuery, skipToken } from "metabase/api";
import { SemanticError } from "metabase/components/ErrorPages";
import { SpinnerIcon } from "metabase/components/LoadingSpinner/LoadingSpinner.styled";
import { t } from "ttag";
import { Client } from "@langchain/langgraph-sdk"; 

const ChatAssistant = ({ selectedMessages, selectedThreadId, setSelectedThreadId, chatType, oldCardId, insights, initial_message, setMessages, setInputValue, setThreadId, threadId, inputValue, messages, isChatHistoryOpen, setIsChatHistoryOpen, setShowButton }) => {
    const initialDbName = useSelector(getDBInputValue);
    const initialCompanyName = useSelector(getCompanyName);
    const initialSchema = useSelector(getInitialSchema);
    const inputRef = useRef(null);
    const dispatch = useDispatch();
    const [client, setClient] = useState(null);  // For managing the Client
    const [agent, setAgent] = useState(null);    // For managing the Assistant Agent
    const [thread, setThread] = useState(null);  // To store the created thread
    const langchain_url = "https://assistants-dev-7ca2258c0a7e5ea393441b5aca30fb7c.default.us.langgraph.app";
    const langchain_key = "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";
    const [companyName, setCompanyName] = useState("");
    const [card, setCard] = useState(null);
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
    const [runId, setRunId] = useState('');
    const [codeInterpreterThreadId, setCodeInterpreterThreadId] = useState('');
    const [schema, setSchema] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const { data, isLoading: dbLoading, error: dbError } = useListDatabasesQuery();
    const [selectedHash, setSelectedHash] = useState(null)
    const [showCubeEditButton, setShowCubeEditButton] = useState(false)
    const [requestedFields, setRequestedFields] = useState([]);
    const [pendingInfoMessage, setPendingInfoMessage] = useState(null);
    
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
        const clientInstance = new Client({apiUrl: langchain_url, apiKey: langchain_key});
        setClient(clientInstance);
        
        // Search for assistants
        const assistants = await clientInstance.assistants.search({ metadata: null, limit: 10, offset: 0 });
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
        const createdThread = await clientInstance.threads.create();
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
            handleGetDatasetQueryWithCards(oldCardId)
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
            // Fetch the card details using the provided cardId
            const fetchedCard = await CardApi.get({ cardId });
            const queryCard = await CardApi.query({ cardId });
            const getDatasetQuery = fetchedCard?.dataset_query;
            if (!getDatasetQuery) {
                throw new Error("No dataset query found for this card.");
            }
    
            // Create a new question object based on the fetched card's dataset query
            const defaultQuestionTest = Question.create({
                databaseId: getDatasetQuery.database,
                name: fetchedCard.name,
                type: "query",
                display: fetchedCard.display,
                visualization_settings: {},
                dataset_query: getDatasetQuery,
            });
    
            // Create an item hash for tracking this question
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
    
            // Set up the question and add it to the state
            const newQuestion = defaultQuestionTest.setCard(fetchedCard);
            const hash1 = adhocQuestionHash(itemToHash);
            setResult((prevResult) =>
                Array.isArray(prevResult) ? [...prevResult, queryCard] : [queryCard]
            );
    
            setCodeQuery((prevCodeQuery) => {
                const query =
                    queryCard?.data?.native_form?.query ??
                    "Sorry, for some reason the query was not retrieved properly.";
                return Array.isArray(prevCodeQuery)
                    ? [...prevCodeQuery, query]
                    : [query];
            });
    
            setDefaultQuestion((prevDefaultQuestion) =>
                Array.isArray(prevDefaultQuestion)
                    ? [...prevDefaultQuestion, newQuestion]
                    : [newQuestion]
            );
    
            setCard((prevCard) => {
                const updatedCard = {
                    ...fetchedCard, // Copy all properties from the fetched card
                    hash: hash1, // Add the hash property
                };
                return Array.isArray(prevCard) ? [...prevCard, updatedCard] : [updatedCard];
            });
    
            setCardHash((prevCardHash) =>
                Array.isArray(prevCardHash) ? [...prevCardHash, hash1] : [hash1]
            );
    
        } catch (error) {
            console.error("Error fetching card content:", error);
            setShowError(true);
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
        const tempMessage = {
            id: tempMessageId,
            sender: "server",
            text: "", // This will be updated with the actual content from the response chunks
            isLoading: true,
            isTemporary: true, // Marking as a temporary message
        };
    
        // Append the user message and the temporary server message to the state
        setMessages((prev) => [...prev, userMessage, tempMessage]);
    
        // Call emulateDataStream to show a waiting message while we fetch the first chunk
        emulateDataStream(100, tempMessageId);
    
        // Clear the input field
        setInputValue("");
    
        let currentMessage = ""; // To accumulate partial chunks
        let isNewMessage = true; // Flag to track new message status
        let lastMessageId = tempMessageId; // Track last message to update its loading state
    
        try {
            const streamResponse = client.runs.stream(thread.thread_id, agent.assistant_id, {
                input: {
                    messages: messagesToSend,
                    company_name: initialCompanyName,
                    database_id: initialDbName,
                    schema: initialSchema.schema,
                },
                config: { recursion_limit: 25 },
                streamMode: "messages",
            });
    
            let chunkProcessed = false;  // Flag to check if chunks are processed
    
            for await (const chunk of streamResponse) {
                const { event, data } = chunk;
                chunkProcessed = true;  // Mark as processed when chunk is received
    
                // Handle partial messages
                if (event === "messages/partial" && data.length > 0) {
                    const messageData = data[0];
    
                    // Ensure that content is being extracted and is valid
                    if (messageData && messageData.content && messageData.content[0] && messageData.content[0].text) {
                        const partialText = messageData.content[0].text; // Current text chunk
    
                        if (isNewMessage) {
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
                            // Update the most recent message (new chunks for the same message)
                            setMessages((prev) => {
                                const updatedMessages = [...prev];
                                const lastMessageIndex = updatedMessages.findIndex(msg => msg.id === lastMessageId);
    
                                // Replace text of the last message with the new partial content
                                if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].isTemporary) {
                                    updatedMessages[lastMessageIndex].text = partialText;
                                }
    
                                return updatedMessages;
                            });
                        }
    
                        // Store the current message to ensure the final text is updated correctly
                        currentMessage = partialText;
                    }
                }
    
                // Handle complete messages
                if (event === "messages/complete" && data.length > 0) {
                    const messageData = data[0];
    
                    if (messageData && typeof messageData.content === 'string') {
                        // Mark the current message as complete and replace the temporary message with the final message content
                        setMessages((prev) => {
                            const updatedMessages = [...prev];
                            const lastMessageIndex = updatedMessages.findIndex(msg => msg.id === lastMessageId);
    
                            if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].isTemporary) {
                                // Replace temporary message with the final complete message content
                                updatedMessages[lastMessageIndex].text = currentMessage;
                                updatedMessages[lastMessageIndex].isLoading = false;
                                updatedMessages[lastMessageIndex].isTemporary = false;
                            } else {
                                // Add a new message for complete content
                                const completeMessage = {
                                    id: Date.now() + Math.random(),
                                    sender: "server",
                                    text: currentMessage,
                                    showVisualization: false,
                                    visualizationIdx,
                                    isLoading: false,
                                };
                                updatedMessages.push(completeMessage);
                            }
    
                            return updatedMessages;
                        });
    
                        // Reset for the next message
                        currentMessage = "";
                        isNewMessage = true; // Ready for a new message stream
                    }
    
                    // Check if the message contains a card_id (tool output)
                    if (messageData.type === "tool") {
                        try {
                            const parsedContent = JSON.parse(messageData.content);
                            const { card_id } = parsedContent;
    
                            if (card_id) {
                                // Create a temporary message to show card generation progress
                                const cardMessageId = Date.now() + Math.random();
                                const cardTempMessage = {
                                    id: cardMessageId,
                                    sender: "server",
                                    text: "Generating card...", // Show progress text
                                    isLoading: true,
                                    isTemporary: true,
                                };
    
                                // Append the card generation message without removing any prior message
                                setMessages((prev) => [...prev, cardTempMessage]);
    
                                // Show the card generation progress message
                                showCardGenerationMessage(75, cardMessageId);
    
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
                            }
                        } catch (error) {
                            console.error("Error parsing tool message content:", error);
                        }
                    }
                }
            }
    
            // Set loading to false once all chunks are processed
            if (!chunkProcessed) {
                setIsLoading(false);
            }
        } catch (error) {
            console.error("Error during message processing:", error.message);
        } finally {
            // Ensure loading is turned off when the process finishes, even if there are no more chunks
            setIsLoading(false);
    
            // Update the last message to ensure it is marked as fully loaded
            setMessages((prev) => {
                const updatedMessages = [...prev];
                const lastMessageIndex = updatedMessages.findIndex(msg => msg.id === lastMessageId);
    
                if (lastMessageIndex >= 0) {
                    updatedMessages[lastMessageIndex].isLoading = false;
                }
    
                return updatedMessages;
            });
        }
    };
    
    
    
      
      
    
    
    function showCardGenerationMessage(chunkInterval = 100, tempMessageId) {
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
function emulateDataStream(chunkInterval = 100, tempMessageId) {
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
                                showError={showError} insightsPlan={inisghtPlan} showCubeEditButton={showCubeEditButton} sendAdminRequest={handleCubeRequestDialogOpen} onSuggestion={handleSuggestion}
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
                                                disabled={!client || chatLoading || schema.length < 1 || selectedThreadId}
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
                                                disabled={!client || schema.length < 1 || selectedThreadId}
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

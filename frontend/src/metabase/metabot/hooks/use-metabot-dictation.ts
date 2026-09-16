import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useTranscribeMetabotDictationMutation } from "metabase/metabot/api";

export const MAX_DICTATION_MS = 5 * 60 * 1000;
export const MAX_DICTATION_BYTES = 24_000_000;

export type DictationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "recording"; stream: MediaStream }
  | { status: "transcribing" }
  | { status: "error"; message: string; canRetry: boolean };

type TranscriptionRequest = ReturnType<
  ReturnType<typeof useTranscribeMetabotDictationMutation>[0]
>;

type RecordingSession = {
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  timer: ReturnType<typeof setTimeout> | null;
  chunks: Blob[];
  bytes: number;
  stopped: boolean;
  recording: Blob | null;
  request: TranscriptionRequest | null;
};

function releaseMicrophone(session: RecordingSession) {
  if (session.timer !== null) {
    clearTimeout(session.timer);
  }
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
}

function disposeSession(session: RecordingSession) {
  session.request?.abort();
  if (session.recorder) {
    session.recorder.ondataavailable = null;
    session.recorder.onstop = null;
    session.recorder.onerror = null;
    if (session.recorder.state !== "inactive") {
      session.recorder.stop();
    }
  }
  releaseMicrophone(session);
}

function microphoneError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return t`Microphone access was denied. Allow microphone access in your browser's site settings, then try again.`;
    }
    if (error.name === "NotFoundError") {
      return t`No microphone was found. Connect a microphone and try again.`;
    }
    if (error.name === "NotReadableError") {
      return t`Your microphone is unavailable. Check that another app isn't using it, then try again.`;
    }
  }
  return t`Could not record audio. Check your microphone and try again.`;
}

export function useMetabotDictation(
  onComplete: (text: string, send: boolean) => void,
) {
  const [state, setState] = useState<DictationState>({ status: "idle" });
  const sessionRef = useRef<RecordingSession | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [transcribe] = useTranscribeMetabotDictationMutation();

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      disposeSession(session);
    }
    setState({ status: "idle" });
  }, []);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        disposeSession(session);
      }
    },
    [],
  );

  const transcribeRecording = async (
    session: RecordingSession,
    send: boolean,
  ) => {
    const recording = session.recording;
    if (!recording || sessionRef.current !== session || session.request) {
      return;
    }
    setState({ status: "transcribing" });
    const request = transcribe(recording);
    session.request = request;
    try {
      const { text } = await request.unwrap();
      if (sessionRef.current !== session) {
        return;
      }
      if (!text.trim()) {
        setState({
          status: "error",
          message: t`No speech was detected. Cancel and try recording again.`,
          canRetry: false,
        });
        return;
      }
      sessionRef.current = null;
      setState({ status: "idle" });
      onCompleteRef.current(text, send);
    } catch (error) {
      if (sessionRef.current === session) {
        setState({
          status: "error",
          message: getErrorMessage(
            error,
            t`Could not transcribe the recording. Please try again.`,
          ),
          canRetry: true,
        });
      }
    } finally {
      session.request = null;
    }
  };

  const stop = (send: boolean) => {
    const session = sessionRef.current;
    if (!session?.recorder || session.stopped) {
      return;
    }
    session.stopped = true;
    setState({ status: "transcribing" });
    session.recorder.onstop = () => {
      if (sessionRef.current !== session) {
        return;
      }
      const recording = new Blob(session.chunks, {
        type: session.recorder?.mimeType,
      });
      session.chunks = [];
      if (!recording.size || recording.size > MAX_DICTATION_BYTES) {
        setState({
          status: "error",
          message: recording.size
            ? t`The recording is too large. Cancel and try a shorter recording.`
            : t`The recording is empty. Cancel and try again.`,
          canRetry: false,
        });
        return;
      }
      session.recording = recording;
      void transcribeRecording(session, send);
    };
    if (session.recorder.state !== "inactive") {
      session.recorder.stop();
    }
    releaseMicrophone(session);
  };

  const start = async () => {
    if (sessionRef.current) {
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState({
        status: "error",
        message: t`Dictation requires a browser with microphone support and a secure (HTTPS) connection.`,
        canRetry: false,
      });
      return;
    }
    const mimeType =
      typeof MediaRecorder !== "undefined"
        ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
            MediaRecorder.isTypeSupported(type),
          )
        : undefined;
    if (!mimeType) {
      setState({
        status: "error",
        message: t`This browser doesn't support audio recording. Try another browser.`,
        canRetry: false,
      });
      return;
    }
    const session: RecordingSession = {
      recorder: null,
      stream: null,
      timer: null,
      chunks: [],
      bytes: 0,
      stopped: false,
      recording: null,
      request: null,
    };
    sessionRef.current = session;
    setState({ status: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      session.recorder = recorder;
      recorder.ondataavailable = ({ data }) => {
        if (sessionRef.current !== session || !data.size) {
          return;
        }
        session.chunks.push(data);
        session.bytes += data.size;
        // Leave room for the final chunk emitted by stop().
        if (session.bytes >= MAX_DICTATION_BYTES - 1_000_000) {
          stop(false);
        }
      };
      recorder.onerror = () => {
        if (sessionRef.current === session) {
          disposeSession(session);
          setState({
            status: "error",
            message: microphoneError(null),
            canRetry: false,
          });
        }
      };
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener(
          "ended",
          () => {
            if (sessionRef.current === session) {
              stop(false);
            }
          },
          { once: true },
        );
      });
      recorder.start(1000);
      session.timer = setTimeout(() => stop(false), MAX_DICTATION_MS);
      setState({ status: "recording", stream });
    } catch (error) {
      if (sessionRef.current === session) {
        disposeSession(session);
        setState({
          status: "error",
          message: microphoneError(error),
          canRetry: false,
        });
      }
    }
  };

  const retry = () => {
    if (sessionRef.current) {
      void transcribeRecording(sessionRef.current, false);
    }
  };

  return { state, start, stop, cancel, retry };
}

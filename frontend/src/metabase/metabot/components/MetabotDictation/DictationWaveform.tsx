import { useEffect, useRef } from "react";

import S from "./MetabotDictation.module.css";

const BAR_WIDTH = 3;
const BAR_SPACING = 6;
const BAR_INTERVAL_MS = 80;
const MAX_BAR_HEIGHT = 24;

function drawBars(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  levels: readonly number[],
  progress: number,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scale = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(width * scale));
  const pixelHeight = Math.max(1, Math.round(height * scale));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = getComputedStyle(canvas).color;
  context.lineWidth = BAR_WIDTH;
  context.lineCap = "round";
  context.beginPath();
  const barCount = Math.ceil(width / BAR_SPACING) + 1;
  for (let index = 0; index < barCount; index++) {
    const level = levels[levels.length - 1 - index] ?? 0;
    const barHeight = Math.max(BAR_WIDTH, level * MAX_BAR_HEIGHT);
    const x = width - BAR_WIDTH / 2 - (index + progress) * BAR_SPACING;
    const halfLength = Math.max(0.01, (barHeight - BAR_WIDTH) / 2);
    context.moveTo(x, height / 2 - halfLength);
    context.lineTo(x, height / 2 + halfLength);
  }
  context.stroke();
}

export function DictationWaveform({ stream }: { stream: MediaStream }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (
      !canvas ||
      typeof AudioContext === "undefined" ||
      !stream.getAudioTracks().length
    ) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    const source = audio.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 2048;
    const samples = new Uint8Array(analyser.fftSize);
    const levels: number[] = [];
    let lastSampleTime = performance.now();
    let peak = 0;
    let frame = 0;
    const draw = (time: number) => {
      analyser.getByteTimeDomainData(samples);
      const energy = samples.reduce(
        (sum, sample) => sum + ((sample - 128) / 128) ** 2,
        0,
      );
      peak = Math.max(
        peak,
        Math.min(1, Math.sqrt(energy / samples.length) * 4),
      );
      const elapsed = time - lastSampleTime;
      if (elapsed >= BAR_INTERVAL_MS) {
        const barCount = Math.ceil(canvas.clientWidth / BAR_SPACING) + 1;
        const elapsedBars = Math.min(
          barCount,
          Math.floor(elapsed / BAR_INTERVAL_MS),
        );
        levels.push(...Array<number>(elapsedBars - 1).fill(0), peak);
        levels.splice(0, Math.max(0, levels.length - barCount));
        lastSampleTime = time - (elapsed % BAR_INTERVAL_MS);
        peak = 0;
      }
      drawBars(
        canvas,
        context,
        levels,
        (time - lastSampleTime) / BAR_INTERVAL_MS,
      );
      frame = requestAnimationFrame(draw);
    };
    void audio.resume().catch(() => {});
    draw(lastSampleTime);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void audio.close().catch(() => {});
    };
  }, [stream]);

  return <canvas ref={canvasRef} className={S.waveform} aria-hidden="true" />;
}

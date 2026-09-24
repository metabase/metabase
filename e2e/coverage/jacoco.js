/**
 * Talks to a JaCoCo agent started with `output=tcpserver`, and reads the execution data it answers with, which has the same format as a `.exec` file.
 * The format is defined by org.jacoco.core.data.ExecutionDataWriter and org.jacoco.core.runtime.RemoteControlWriter.
 */
const { Buffer } = require("node:buffer");
const net = require("node:net");

const BLOCK_HEADER = 0x01;
const BLOCK_SESSIONINFO = 0x10;
const BLOCK_EXECUTIONDATA = 0x11;
const BLOCK_CMDOK = 0x20;
const BLOCK_CMDDUMP = 0x40;
const MAGIC_NUMBER = 0xc0c0;
const FORMAT_VERSION = 0x1007;

class Incomplete extends Error {}

class Reader {
  constructor(buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
  }

  need(bytes) {
    if (this.offset + bytes > this.buffer.length) {
      throw new Incomplete();
    }
  }

  byte() {
    this.need(1);
    return this.buffer[this.offset++];
  }

  char() {
    this.need(2);
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  long() {
    this.need(8);
    const value = this.buffer.readBigUInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  utf() {
    const length = this.char();
    this.need(length);
    const value = this.buffer.toString(
      "utf8",
      this.offset,
      this.offset + length,
    );
    this.offset += length;
    return value;
  }

  varInt() {
    let value = 0;
    let shift = 0;
    for (;;) {
      const b = this.byte();
      value |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) {
        return value >>> 0;
      }
      shift += 7;
    }
  }

  // Probes are packed eight to a byte, lowest bit first.
  booleanArray() {
    const length = this.varInt();
    const bytes = Math.ceil(length / 8);
    this.need(bytes);
    const packed = this.buffer.subarray(this.offset, this.offset + bytes);
    this.offset += bytes;
    let hits = 0;
    for (let i = 0; i < length; i++) {
      if (packed[i >> 3] & (1 << (i & 7))) {
        hits += 1;
      }
    }
    return { length, hits, packed: Buffer.from(packed) };
  }
}

/**
 * Returns null when `buffer` ends before the data does, or, with `remote`, before the CMD_OK block that closes a dump.
 * `end` is the offset of that CMD_OK block, or the buffer length for a `.exec` file.
 */
function parseExecutionData(buffer, { remote = false } = {}) {
  const reader = new Reader(buffer);
  const sessions = [];
  const classes = [];
  try {
    while (reader.offset < buffer.length) {
      const start = reader.offset;
      const type = reader.byte();
      if (type === BLOCK_HEADER) {
        if (reader.char() !== MAGIC_NUMBER) {
          throw new Error("Not JaCoCo execution data");
        }
        const version = reader.char();
        if (version !== FORMAT_VERSION) {
          throw new Error(
            `Unsupported JaCoCo data format version 0x${version.toString(16)}`,
          );
        }
      } else if (type === BLOCK_SESSIONINFO) {
        sessions.push({
          id: reader.utf(),
          start: Number(reader.long()),
          dump: Number(reader.long()),
        });
      } else if (type === BLOCK_EXECUTIONDATA) {
        const id = reader.long().toString(16).padStart(16, "0");
        const name = reader.utf();
        const probes = reader.booleanArray();
        classes.push({ id, name, probes });
      } else if (type === BLOCK_CMDOK) {
        return { sessions, classes, end: start };
      } else {
        throw new Error(`Unknown JaCoCo block type 0x${type.toString(16)}`);
      }
    }
  } catch (error) {
    if (error instanceof Incomplete) {
      return null;
    }
    throw error;
  }
  return remote ? null : { sessions, classes, end: buffer.length };
}

function dumpOnce({ host, port, reset, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error(`JaCoCo dump timed out after ${timeoutMs}ms`));
    });
    socket.on("connect", () => {
      const request = Buffer.alloc(8);
      request.writeUInt8(BLOCK_HEADER, 0);
      request.writeUInt16BE(MAGIC_NUMBER, 1);
      request.writeUInt16BE(FORMAT_VERSION, 3);
      request.writeUInt8(BLOCK_CMDDUMP, 5);
      request.writeUInt8(1, 6);
      request.writeUInt8(reset ? 1 : 0, 7);
      socket.write(request);
    });
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      received += chunk.length;
      // A dump ends with a CMD_OK block, so only a buffer ending in that byte can be complete.
      if (chunk[chunk.length - 1] !== BLOCK_CMDOK) {
        return;
      }
      const buffer = Buffer.concat(chunks, received);
      let parsed;
      try {
        parsed = parseExecutionData(buffer, { remote: true });
      } catch (error) {
        socket.destroy(error);
        return;
      }
      if (parsed) {
        socket.end();
        resolve({ ...parsed, exec: buffer.subarray(0, parsed.end) });
      }
    });
    socket.on("error", reject);
    socket.on("close", () => {
      reject(
        new Error("JaCoCo agent closed the connection before the dump ended"),
      );
    });
  });
}

/**
 * With `reset`, the agent zeroes its probes after answering, so the next dump only holds what ran in between.
 * `exec` is the answer without its closing CMD_OK block, which makes it a valid `.exec` file.
 */
async function dump({
  host = "127.0.0.1",
  port,
  reset = true,
  timeoutMs = 20000,
  connectAttempts = 10,
}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await dumpOnce({ host, port, reset, timeoutMs });
    } catch (error) {
      // The agent opens its port a few seconds after the JVM starts.
      if (error.code !== "ECONNREFUSED" || attempt >= connectAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

/** The class-level hit set of a dump: one "name id" key per class with at least one probe hit. */
function hitClasses(parsed) {
  return parsed.classes
    .filter((c) => c.probes.hits > 0)
    .map((c) => `${c.name} ${c.id}`)
    .sort();
}

module.exports = { dump, parseExecutionData, hitClasses };

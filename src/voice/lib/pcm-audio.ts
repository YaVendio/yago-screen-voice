/** Sample rate the realtime API expects for both input and output PCM. */
export const REALTIME_SAMPLE_RATE = 24000

export function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]))
    // Asymmetric scaling: int16 reaches -32768 but only +32767.
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return output
}

export function int16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) {
    output[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff)
  }
  return output
}

/** Linear resampling; the browser will not always hand us a 24 kHz capture context. */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input

  const ratio = fromRate / toRate
  const outputLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index
    const next = index + 1 < input.length ? input[index + 1] : input[index]
    output[i] = input[index] * (1 - fraction) + next * fraction
  }

  return output
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  // Chunked to keep the argument list under the engine's spread limit on long buffers.
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunkSize)))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Encodes a capture buffer as the base64 PCM16 payload of `input_audio_buffer.append`. */
export function encodeAudioChunk(input: Float32Array, sourceRate: number): string {
  const resampled = resample(input, sourceRate, REALTIME_SAMPLE_RATE)
  const pcm = floatTo16BitPcm(resampled)
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength))
}

/** Decodes an `output_audio.delta` payload into samples ready for an AudioBuffer. */
export function decodeAudioChunk(base64: string): Float32Array {
  const bytes = base64ToBytes(base64)
  // The payload is not guaranteed to start on an even byte offset once copied around,
  // so build the Int16 view over a byte-aligned copy.
  const aligned = new Uint8Array(bytes.byteLength - (bytes.byteLength % 2))
  aligned.set(bytes.subarray(0, aligned.length))
  return int16ToFloat32(new Int16Array(aligned.buffer))
}

import { System_String } from "./Platform";

interface TimingRegion {
    // To minimize overhead, don't even decode the strings that arrive from .NET. Assume they are compile-time constants
    // and hence the memory address will be fixed, so we can just store the pointer value.
    name: string | System_String;
    startTime: number;
    endTime?: number;
}

interface TraceEvent {
    // https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
    name: string;
    cat: string; // Category
    ph: 'B' | 'E'; // Phase
    ts: number; // Timestamp in microseconds
    pid: number; // Process ID
    tid: number; // Thread ID
}

let _captureStartTime = 0;
const _openRegionsStack: TimingRegion[] = [];
const _startLog: TimingRegion[] = [];
const _endLog: TimingRegion[] = [];

export function profileStart(name: System_String | string) {
    if (!_captureStartTime) {
        _captureStartTime = performance.now();
    }

    const region = { name: name, startTime: performance.now() };
    _openRegionsStack.push(region);
    _startLog.push(region);
}

export function profileEnd(name: System_String | string) {
    const endTime = performance.now();
    const poppedRegion = _openRegionsStack.pop();
    if (!poppedRegion) {
        throw new Error(`Profiling mismatch: tried to end profiling for '${readJsString(name)}', but the stack was empty.`);
    } else if (poppedRegion.name !== name) {
        throw new Error(`Profiling mismatch: tried to end profiling for '${readJsString(name)}', but the top stack item was '${readJsString(poppedRegion.name)}'.`);
    }

    poppedRegion.endTime = endTime;
    _endLog.push(poppedRegion);
}

export function profileReset() {
    _openRegionsStack.length = 0;
    _startLog.length = 0;
    _endLog.length = 0;
    _captureStartTime = 0;
}

export function profileExport() {
    // Merge the two logs into a single ordered list of trace events
    const traceEvents: TraceEvent[] = [];
    let startLogIndex = 0, endLogIndex = 0;
    while (startLogIndex < _startLog.length || endLogIndex < _endLog.length) {
        const nextStart = _startLog[startLogIndex];
        const nextEnd = _endLog[endLogIndex];
        const useStart = !nextEnd || (nextStart && nextStart.startTime <= nextEnd.endTime!);
        if (useStart) {
            traceEvents.push({ name: readJsString(nextStart.name)!, cat: 'PERF', ph: 'B', ts: (nextStart.startTime - _captureStartTime) * 1000, pid: 0, tid: 0 });
            startLogIndex++;
        } else {
            traceEvents.push({ name: readJsString(nextEnd.name)!, cat: 'PERF', ph: 'E', ts: (nextEnd.endTime! - _captureStartTime) * 1000, pid: 0, tid: 0 });
            endLogIndex++;
        }
    }

    const traceEventsJson = JSON.stringify(traceEvents);
    const traceEventsBuffer = new TextEncoder().encode(traceEventsJson);
    const anchorElement = document.createElement('a');
    anchorElement.href = URL.createObjectURL(new Blob([traceEventsBuffer]));
    anchorElement.setAttribute('download', 'trace.json');
    anchorElement.click();
    URL.revokeObjectURL(anchorElement.href);
}

function readJsString(str: string | System_String) {
    // This is expensive, so don't do it while capturing timings. Only do it as part of the export process.
    return typeof str === 'string' ? str : BINDING.conv_string(str);
}

// These globals deliberately differ from our normal conventions for attaching functions inside Blazor.*
// because the intention is to minimize overhead in all reasonable ways. Having any dot-separators in the
// name would cause extra string allocations on every invocation.
window['_blazorProfileStart'] = profileStart;
window['_blazorProfileEnd'] = profileEnd;
window['_blazorProfileReset'] = profileReset;
window['_blazorProfileExport'] = profileExport;

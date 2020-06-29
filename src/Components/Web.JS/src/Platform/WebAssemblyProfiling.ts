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

const _openRegionsStack: TimingRegion[] = [];
const _log: TimingRegion[] = [];

export function profileStart(name: System_String | string) {
    const region = { name: name, startTime: performance.now() };
    _openRegionsStack.push(region);
    _log.push(region)
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
}

export function profileReset() {
    _openRegionsStack.length = 0;
    _log.length = 0;
}

export function profileExport() {
    const traceEvents: TraceEvent[] = [];
    _log.forEach(entry => {
        traceEvents.push({ name: readJsString(entry.name)!, cat: 'PERF', ph: 'B', ts: entry.startTime * 1000, pid: 0, tid: 0 });
        traceEvents.push({ name: readJsString(entry.name)!, cat: 'PERF', ph: 'E', ts: entry.endTime! * 1000, pid: 0, tid: 0 });
    });
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

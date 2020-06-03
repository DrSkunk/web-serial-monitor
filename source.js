if ('serial' in navigator) {
    const notSupported = document.getElementById('notSupported');
    notSupported.classList.add('hidden');
}

const log = document.getElementById("log")


function send() {
    const toSend = document.getElementById("input").value
    writeToStream(toSend + '\r')
    document.getElementById("input").value = ""

}

function handleKeypress(e) {
    if (e.keyCode === 13) {
        e.preventDefault();
        send();
    }
}


async function connect() {
    let reader;
    async function readLoop() {
        console.log('Readloop');

        while (true) {
            const { value, done } = await reader.read();

            if (value) {
                log.textContent += value;
                log.scrollTop = log.scrollHeight;
            }
            if (done) {
                console.log('[readLoop] DONE', done);
                reader.releaseLock();
                break;
            }
        }
    }

    const inputField = document.getElementById("input");
    inputField.disabled = false;
    inputField.focus();
    inputField.select();
    document.getElementById("sendButton").disabled = false;
    document.getElementById("connect").disabled = true;

    port = await navigator.serial.requestPort();
    // - Wait for the port to open.
    await port.open({ baudrate: 115200 });

    let decoder = new TextDecoderStream();
    inputDone = port.readable.pipeTo(decoder.writable);
    inputStream = decoder.readable;

    const encoder = new TextEncoderStream();
    outputDone = encoder.readable.pipeTo(port.writable);
    outputStream = encoder.writable;

    reader = inputStream.getReader();
    readLoop();
}

async function writeToStream(line) {
    const writer = outputStream.getWriter();
    console.log('[SEND]', line);
    await writer.write(line);
    writer.releaseLock();
}


const BUFFER_SIZE = 32

function testFile() {
    const data =
        `
import time
for i in range(0,100):
    print("Hello3 " + str(i))
    time.sleep(1)
`
    put(data)
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function enterRawRepl() {
    // http://docs.micropython.org/en/latest/reference/repl.html#raw-mode

    console.log('entering raw REPL');

    // sequence comes from ampy 
    // ctrl-C twice: interrupt any running program
    await writeToStream('\r\x03');
    await timeout(100);
    await writeToStream('\x03');
    await timeout(100);

    // ctrl-A: enter raw REPL
    await writeToStream('\r\x01');

    await timeout(100);
    // ctrl-D: soft reset
    await softReset();

    // Add a small delay and send Ctrl-C twice after soft reboot to ensure
    // any main program loop in main.py is interrupted.
    await timeout(500);
    await writeToStream('\x03');
    await timeout(100);
    await writeToStream('\x03');
}

async function exitRawRepl() {
    console.log('exiting raw REPL');
    await writeToStream('\r\x02');
}

/*
Put stores the argument cmds to the flash on board as the file named filename (main.py default) via rawrepl.
*/
async function put(cmds, filename = 'main.py', autoExec = true) {
    await enterRawRepl();
    console.log("uploading and executing", cmds);

    // Loop through each line and write a buffer size chunk of data at a time.
    await writeToStream("f = open('" + filename + "', 'wb')\r");

    const array = cmds.split('\n')
    for (let i = 0; i < array.length; i++) {
        const line = array[i];

        for (let j = 0; j < array[i].length; j += BUFFER_SIZE) {
            const chunk = line.slice(j, Math.min(array[i].length, j + BUFFER_SIZE))
            await writeToStream("f.write('" + chunk + "')\r");
        }

        await writeToStream("f.write('\\n')\r");
    }
    await writeToStream("f.close()\r");
    await timeout(100);

    // send CTRL signal to execute instructions in raw repl
    await softReset();
    await timeout(100);

    await exitRawRepl();

    // reset if needed
    autoExec && await softReset();

}

async function softReset() {
    await writeToStream('\x04');

}

// to quickly check the file via the python repl
// f = open("main.py", "r")
// print(f.readlines())

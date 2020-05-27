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

function handle(e) {
    if (e.keyCode === 13) {
        e.preventDefault();
        send();
    }
}

async function connect() {
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

const BUFFER_SIZE = 32

function testFile() {
    const data =
        `
import time
for i in range(0,100):
    print("Hello " + str(i))
    time.sleep(1)
`
    put(data)
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function enterRawRepl() {
    console.log('entering raw REPL');

    // ctrl-C twice: interrupt any running program
    // self.serial.write(b'\r\x03')
    // time.sleep(0.1)
    // self.serial.write(b'\x03')
    // time.sleep(0.1)
    await writeToStream('\r\x03')
    await timeout(100);
    await writeToStream('\x03')
    await timeout(100);

    // flush input (without relying on serial.flushInput())
    // n = self.serial.inWaiting()
    // while n > 0:
    //     self.serial.read(n)
    //     n = self.serial.inWaiting()

    // self.serial.write(b'\r\x01') # ctrl-A: enter raw REPL
    // data = self.read_until(1, b'raw REPL; CTRL-B to exit\r\n>')
    // if not data.endswith(b'raw REPL; CTRL-B to exit\r\n>'):
    //     print(data)
    //     raise PyboardError('could not enter raw repl')
    await writeToStream('\r\x01')

    // self.serial.write(b'\x04') # ctrl-D: soft reset
    // data = self.read_until(1, b'soft reboot\r\n')
    // if not data.endswith(b'soft reboot\r\n'):
    //     print(data)
    //     raise PyboardError('could not enter raw repl')
    await timeout(100);
    await writeToStream('\x04')

    // # By splitting this into 2 reads, it allows boot.py to print stuff,
    // # which will show up after the soft reboot and before the raw REPL.
    // # Modification from original pyboard.py below:
    // #   Add a small delay and send Ctrl-C twice after soft reboot to ensure
    // #   any main program loop in main.py is interrupted.
    // time.sleep(0.5)
    // self.serial.write(b'\x03')
    // time.sleep(0.1)           # (slight delay before second interrupt
    // self.serial.write(b'\x03')
    // # End modification above.
    // data = self.read_until(1, b'raw REPL; CTRL-B to exit\r\n')
    // if not data.endswith(b'raw REPL; CTRL-B to exit\r\n'):
    //     print(data)
    //     raise PyboardError('could not enter raw repl')
    await timeout(500);
    await writeToStream('\x03')
    await timeout(100);
    await writeToStream('\x03')
}

async function exitRawRepl() {
    console.log('exiting raw REPL');
    await writeToStream('\r\x02');
}

async function put(cmds) {
    await enterRawRepl();
    //cmds = "a = 42;print(a)"

    console.log("uploading and executing", cmds);
    const size = cmds.length;

    // # Loop through and write a buffer size chunk of data at a time.
    // for i in range(0, size, BUFFER_SIZE):
    await writeToStream("f = open('main.py', 'wb')\r");

    const array = cmds.split('\n')
    for (let i = 0; i < array.length; i++) {

        const cmd = array[i];
        await writeToStream("f.write('" + cmd + "\\n')\r");
        console.log('cmd', cmd);
    }

    // for (let i = 0; i < size; i += BUFFER_SIZE) {
    //     // chunk_size = min(BUFFER_SIZE, size - i)
    //     chunk_size = Math.min(BUFFER_SIZE, size - i)
    //     // chunk = repr(data[i : i + chunk_size])
    //     const chunk = cmds.substring(i, i + chunk_size);
    //     console.log('chunk', chunk);

    //     //     if not chunk.startswith("b"):
    //     //         chunk = "b" + chunk
    //     //     self._pyboard.exec_("f.write({0})".format(chunk))
    //     await writeToStream("f.write('" + chunk + "')\r");
    // }
    await writeToStream("f.close()\r");
    await timeout(100);
    await writeToStream('\x04')
    await timeout(100);
    await exitRawRepl();
}

// f = open("main.py", "r")
// print(f.readlines())

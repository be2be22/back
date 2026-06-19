const { WebSocketServer } = require('ws');
const net = require('net');

// ==========================================
// تنظیمات (UUID را حتما تغییر دهید)
// ==========================================
const userID = "d342d11e-d424-4583-b36e-524ab1f0afa4"; 
const uuidBytes = Buffer.from(userID.replace(/-/g, ''), 'hex');

// Back4App پورت را از طریق متغیر محیطی می‌دهد
const PORT = process.env.PORT || 8080; 

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', ws => {
    ws.binaryType = 'arraybuffer';
    let tcpSocket = null;
    let headerProcessed = false;

    ws.on('message', (data) => {
        const vlessBuffer = Buffer.from(data);

        if (!headerProcessed) {
            try {
                const version = vlessBuffer[0];
                const clientUUID = vlessBuffer.slice(1, 17);
                
                if (!clientUUID.equals(uuidBytes)) {
                    ws.close(); return;
                }

                const addonLength = vlessBuffer[17];
                const command = vlessBuffer[18 + addonLength];
                if (command !== 1) { ws.close(); return; }

                const port = vlessBuffer.readUInt16BE(19 + addonLength);
                const addrType = vlessBuffer[21 + addonLength];
                
                let offset = 22 + addonLength;
                let addr = "";

                if (addrType === 1) { // IPv4
                    addr = `${vlessBuffer[offset]}.${vlessBuffer[offset+1]}.${vlessBuffer[offset+2]}.${vlessBuffer[offset+3]}`;
                    offset += 4;
                } else if (addrType === 2) { // Domain
                    const addrLen = vlessBuffer[offset];
                    offset += 1;
                    addr = vlessBuffer.toString('utf8', offset, offset + addrLen);
                    offset += addrLen;
                } else {
                    ws.close(); return;
                }

                const initialPayload = vlessBuffer.slice(offset);

                // اتصال به سایت هدف
                tcpSocket = net.connect(port, addr, () => {
                    headerProcessed = true;
                    // ارسال هدر تایید به v2rayNG
                    const responseHeader = Buffer.from([version, 0]);
                    ws.send(responseHeader);
                    
                    if (initialPayload.length > 0) {
                        tcpSocket.write(initialPayload);
                    }
                });

                tcpSocket.on('data', (chunk) => {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(chunk);
                    }
                });

                tcpSocket.on('close', () => ws.close());
                tcpSocket.on('error', () => ws.close());

            } catch (err) {
                ws.close();
            }
        } else {
            // ارسال دیتای اینترنت به سایت هدف
            if (tcpSocket && tcpSocket.writable) {
                tcpSocket.write(vlessBuffer);
            }
        }
    });

    ws.on('close', () => {
        if (tcpSocket) tcpSocket.destroy();
    });

    ws.on('error', () => {
        if (tcpSocket) tcpSocket.destroy();
    });
});

console.log(`VLESS WS Proxy is running on port ${PORT}`);

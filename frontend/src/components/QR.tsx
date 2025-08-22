import { QRCodeCanvas } from "qrcode.react";

export default function QR({ value }: { value: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow inline-block">
      <QRCodeCanvas value={value} size={220} includeMargin />
    </div>
  );
}

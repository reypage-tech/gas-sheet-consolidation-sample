# Builds demo/demo.gif from recreated screens (fictional data). Every frame carries the caption.
import csv
from PIL import Image, ImageDraw, ImageFont
W,H=1100,620
F="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; FB="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
f=ImageFont.truetype(F,15); fb=ImageFont.truetype(FB,15); fc=ImageFont.truetype(FB,22); ft=ImageFont.truetype(FB,18)
def rd(n): return list(csv.reader(open('sample_data/'+n)))
src={'North Branch':rd('north_branch.csv'),'South Branch':rd('south_branch.csv'),'Warehouse':rd('warehouse.csv')}
cons=[["record_id","sku","date","item_name","qty","unit_price","branch","updated_at"],
["S-501","AB-100","2026-10-01","Steel Bracket","42","2.5","South Branch","2026-10-01 15:20"],
["N-002","AB-101","2026-10-01","Hinge set","15","4.2","North Branch","2026-10-01 09:12"],
["N-003","CD-200","2026-10-02","Cable tie pack","100","0.8","North Branch","2026-10-02 10:00"],
["S-502","GH-400","2026-10-02","Door handle","8","12","South Branch","2026-10-02 11:05"],
["N-004","AB-100","2026-10-03","Steel bracket","25","2.5","North Branch","2026-10-03 08:30"],
["N-005","EF-300","2026-10-03","Wall anchor","60","0.35","North Branch","2026-10-03 08:45"],
["S-504","IJ-500","2026-10-03","Shelf pin","200","0.1","South Branch","2026-10-03 13:40"],
["W-9002","KL-600","2026-10-04","Corner brace","30","1.75","Warehouse","2026-10-04 10:30"],
["W-9004","MN-700","2026-10-04","Screw box","12","6.4","Warehouse","2026-10-04 16:15"]]
dup=[["key (sku|date)","skipped_source","kept_source","reason"],
["AB-100|2026-10-01","North Branch!2","South Branch!2","Same SKU and date; older updated_at"],
["CD-200|2026-10-02","South Branch!4","North Branch!4","Same SKU and date; older updated_at"],
["EF-300|2026-10-03","Warehouse!2","North Branch!6","Same SKU and date; older updated_at"],
["GH-400|2026-10-02","Warehouse!4","South Branch!3","Same SKU and date; first read kept"]]
runlog=[["started_at","status","rows_read","rows_written","duplicates_skipped","errors"],["2026-10-25 17:50","OK","13","9","4","0"]]
TABS=['North Branch','South Branch','Warehouse','Config','Consolidated','Duplicates log','Run log']
def base(active,title):
    im=Image.new('RGB',(W,H),'white'); d=ImageDraw.Draw(im)
    d.rectangle([0,0,W,40],fill='#f1f3f4'); d.text((14,10),"Branch data (sample)",font=ft,fill='#202124')
    d.text((300,12),"File  Edit  View  Insert  Format  Data  Extensions  Consolidation",font=f,fill='#3c4043')
    d.rectangle([0,H-80,W,H-50],fill='#f1f3f4'); x=8
    for t in TABS:
        w=d.textlength(t,font=f)+20
        if t==active: d.rectangle([x,H-80,x+w,H-50],fill='white'); d.text((x+10,H-74),t,font=fb,fill='#188038')
        else: d.text((x+10,H-74),t,font=f,fill='#5f6368')
        x+=w+4
    d.rectangle([0,H-50,W,H],fill='#202124'); d.text((W//2-d.textlength("Sample / recreated demo",font=fc)//2,H-40),"Sample / recreated demo",font=fc,fill='#fbbc04')
    d.text((14,48),title,font=fb,fill='#1a73e8'); return im,d
def grid(d,rows,y0=78,hl=None,colw=None):
    n=len(rows[0]); cw=colw or [min(170,(W-20)//n)]*n
    for i,r in enumerate(rows):
        y=y0+i*28; x=10
        fill='#e8f0fe' if i==0 else ('#fce8e6' if hl and i in hl else 'white')
        d.rectangle([10,y,10+sum(cw),y+28],fill=fill,outline='#dadce0')
        for j,c in enumerate(r):
            d.line([x,y,x,y+28],fill='#dadce0'); d.text((x+5,y+6),str(c)[:24],font=fb if i==0 else f,fill='#202124'); x+=cw[j]
frames=[]
def add(im,sec): frames.append((im,int(sec*1000)))
hl={'North Branch':[1,3,5],'South Branch':[1,3],'Warehouse':[1,3]}
for t in ['North Branch','South Branch','Warehouse']:
    im,d=base(t,f"1. Source tab '{t}': its own column names and date format (red: will collide)"); grid(d,src[t],hl=hl[t]); add(im,3.5)
im,d=base('Config',"2. Config maps each source column to one standard column"); grid(d,rd('config.csv')[:16],colw=[170,170,190,90,180]); add(im,3.5)
im,d=base('North Branch',"3. Custom menu: Consolidation > Run consolidation"); grid(d,src['North Branch'])
d.rectangle([700,40,980,110],fill='white',outline='#9aa0a6'); d.rectangle([701,44,979,74],fill='#e8f0fe')
d.text((712,50),"Run consolidation",font=fb,fill='#202124'); d.text((712,82),"Create Config sheet template",font=f,fill='#202124'); add(im,3.5)
im,d=base('Consolidated',"4. Consolidated: one table, standard columns, SKUs and dates normalized")
grid(d,cons,colw=[90,90,110,140,60,90,130,160])
d.rectangle([W-480,H-130,W-20,H-90],fill='#323232'); d.text((W-470,H-122),"9 rows consolidated, 4 duplicate rows skipped and logged.",font=f,fill='white'); add(im,5)
im,d=base('Duplicates log',"5. Duplicates log: duplicate rows are skipped and logged, sources untouched"); grid(d,dup,colw=[190,160,160,330]); add(im,4.5)
im,d=base('Run log',"6. Run log: one line per run"); grid(d,runlog,colw=[170,90,110,130,170,90]); add(im,3.5)
ims=[x[0] for x in frames]; ims[0].save('demo/demo.gif',save_all=True,append_images=ims[1:],duration=[x[1] for x in frames],loop=0,optimize=True)
for i,im in enumerate(ims): im.save(f'demo/frame_{i+1}.png')
print(sum(x[1] for x in frames)/1000,'s',len(ims),'frames')
